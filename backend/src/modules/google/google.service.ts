import { google, type drive_v3 } from 'googleapis'
import type { ConnectedAccount, ProviderConfig } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { decryptText, encryptText } from '../../utils/crypto.js'

const googleDriveFolderMimeType = 'application/vnd.google-apps.folder'

export function createOAuthClient(config: ProviderConfig) {
  return new google.auth.OAuth2(decryptText(config.clientIdEncrypted), decryptText(config.clientSecretEncrypted), config.redirectUri)
}

export async function getAuthedGoogleClient(account: ConnectedAccount) {
  if (!account.accessTokenEncrypted || !account.refreshTokenEncrypted || !account.tokenExpiresAt) throw new Error('Google account tokens are missing.')
  if (!account.providerConfigId) throw new Error('Google provider config is missing.')
  const config = await prisma.providerConfig.findUniqueOrThrow({ where: { id: account.providerConfigId } })
  const client = createOAuthClient(config)
  client.setCredentials({
    access_token: decryptText(account.accessTokenEncrypted),
    refresh_token: decryptText(account.refreshTokenEncrypted),
    expiry_date: account.tokenExpiresAt.getTime(),
  })

  if (account.tokenExpiresAt.getTime() < Date.now() + 60_000) {
    const result = await client.refreshAccessToken()
    const credentials = result.credentials
    if (credentials.access_token) {
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEncrypted: encryptText(credentials.access_token),
          tokenExpiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000),
        },
      })
      client.setCredentials(credentials)
    }
  }

  return client
}

export async function syncGoogleQuota(accountId: string) {
  const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: accountId } })
  const auth = await getAuthedGoogleClient(account)
  const drive = google.drive({ version: 'v3', auth })
  const about = await drive.about.get({ fields: 'storageQuota,user' })
  const quota = about.data.storageQuota
  const total = quota?.limit ? BigInt(quota.limit) : null
  const used = quota?.usage ? BigInt(quota.usage) : 0n
  return prisma.storageAccount.upsert({
    where: { connectedAccountId: accountId },
    create: {
      connectedAccountId: accountId,
      totalBytes: total,
      usedBytes: used,
      availableBytes: total === null ? null : total - used,
      trashBytes: quota?.usageInDriveTrash ? BigInt(quota.usageInDriveTrash) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      totalBytes: total,
      usedBytes: used,
      availableBytes: total === null ? null : total - used,
      trashBytes: quota?.usageInDriveTrash ? BigInt(quota.usageInDriveTrash) : null,
      lastSyncedAt: new Date(),
    },
  })
}

// 9Drive works straight on the Drive root instead of a dedicated folder, so files already
// in Drive show up here and uploads land where the user expects them. The real root id is
// resolved rather than the 'root' alias: the sync compares this value against file.parents,
// which always carries concrete ids.
export async function ensureGoogleAppFolder(account: ConnectedAccount) {
  const auth = await getAuthedGoogleClient(account)
  const drive = google.drive({ version: 'v3', auth })
  const root = await drive.files.get({ fileId: 'root', fields: 'id' })
  const folderId = root.data.id
  if (!folderId) throw new Error('Failed to resolve the Google Drive root folder.')
  return folderId
}

export type GoogleAppFolderSyncResult = {
  accountId: string
  created: number
  updated: number
  deleted: number
}

type DriveFileMetadata = {
  id: string
  name: string
  mimeType: string
  sizeBytes: bigint
  parentId: string
  publicRole: string | null
  sharedPeopleCount: number
  thumbnailUrl: string | null
}

async function listAllDriveFiles(drive: drive_v3.Drive, q: string, fields: string) {
  const entries: drive_v3.Schema$File[] = []
  let pageToken: string | undefined
  do {
    const response = await drive.files.list({ q, spaces: 'drive', fields: `nextPageToken,${fields}`, pageSize: 1000, pageToken })
    entries.push(...(response.data.files ?? []))
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)
  return entries
}

// Folders the user created straight in Google Drive are unknown to 9Drive, and a file whose
// parent is unknown has nowhere to be listed. Mirroring the Drive tree first is what makes
// those files visible; the pass returns the Drive-id → 9Drive-folder-id map the file pass needs.
async function mirrorDriveFolderTree(drive: drive_v3.Drive, rootId: string, connectedAccountId: string, userId: string) {
  const driveFolders = await listAllDriveFiles(drive, `mimeType = '${googleDriveFolderMimeType}' and trashed = false and 'me' in owners`, 'files(id,name,parents)')

  const childrenByParent = new Map<string, { id: string; name: string; parentId: string }[]>()
  for (const folder of driveFolders) {
    if (!folder.id) continue
    const parentId = folder.parents?.[0]
    if (!parentId) continue
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push({ id: folder.id, name: folder.name ?? 'Untitled', parentId })
    childrenByParent.set(parentId, siblings)
  }

  // Breadth-first from My Drive: it skips anything outside the root subtree and guarantees a
  // parent is inserted before its children, so the parent mapping below is always resolvable.
  const ordered: { id: string; name: string; parentId: string }[] = []
  const visited = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    for (const child of childrenByParent.get(queue.shift()!) ?? []) {
      if (visited.has(child.id)) continue
      visited.add(child.id)
      ordered.push(child)
      queue.push(child.id)
    }
  }

  const existingFolders = await prisma.folder.findMany({
    where: { userId, connectedAccountId, deletedAt: null, providerFolderId: { not: null } },
    select: { id: true, providerFolderId: true, name: true, parentId: true },
  })
  const existingByProviderId = new Map(existingFolders.map((folder) => [folder.providerFolderId!, folder]))
  const localIdByProviderId = new Map(existingFolders.map((folder) => [folder.providerFolderId!, folder.id]))

  for (const folder of ordered) {
    const localParentId = folder.parentId === rootId ? null : localIdByProviderId.get(folder.parentId) ?? null
    const existing = existingByProviderId.get(folder.id)
    if (!existing) {
      const created = await prisma.folder.create({
        data: { userId, connectedAccountId, provider: 'google_drive', providerFolderId: folder.id, name: folder.name, parentId: localParentId },
      })
      localIdByProviderId.set(folder.id, created.id)
      continue
    }
    // Colour and icon are 9Drive's own decoration, so only the fields Drive owns are refreshed.
    if (existing.name !== folder.name || existing.parentId !== localParentId) {
      await prisma.folder.update({ where: { id: existing.id }, data: { name: folder.name, parentId: localParentId } })
    }
  }

  return localIdByProviderId
}

export async function syncGoogleAppFolderFiles(accountId: string, userId: string): Promise<GoogleAppFolderSyncResult> {
  const account = await prisma.connectedAccount.findFirstOrThrow({ where: { id: accountId, userId, provider: 'google_drive', status: 'connected' } })
  const auth = await getAuthedGoogleClient(account)
  const drive = google.drive({ version: 'v3', auth })
  const appFolderId = await ensureGoogleAppFolder(account)

  const folderIdMap = await mirrorDriveFolderTree(drive, appFolderId, account.id, userId)

  const driveFiles: DriveFileMetadata[] = []
  for (const file of await listAllDriveFiles(drive, `mimeType != '${googleDriveFolderMimeType}' and trashed = false and 'me' in owners`, 'files(id,name,mimeType,size,parents,thumbnailLink,permissions(type,role))')) {
    if (!file.id || !file.name || !file.mimeType) continue
    const parentId = file.parents?.[0] ?? appFolderId
    // Anything parked outside My Drive — a folder someone shared, a shortcut target — has no
    // place in the listing, so it is left out rather than surfaced at the top level.
    if (parentId !== appFolderId && !folderIdMap.has(parentId)) continue
    const permissions = file.permissions ?? []
    const publicRole = permissions.find((permission) => permission.type === 'anyone')?.role ?? null
    // The owner is a permission too, and it is never a sign that the file was shared.
    const sharedPeopleCount = permissions.filter((permission) => permission.type === 'user' && permission.role !== 'owner').length
    driveFiles.push({ id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: BigInt(file.size ?? 0), parentId, publicRole, sharedPeopleCount, thumbnailUrl: file.thumbnailLink ?? null })
  }

  const existingFiles = await prisma.file.findMany({ where: { userId, connectedAccountId: account.id, provider: 'google_drive' } })
  const existingByProviderId = new Map(existingFiles.map((file) => [file.providerFileId, file]))
  const driveFileIds = new Set(driveFiles.map((file) => file.id))
  let created = 0
  let updated = 0
  let deleted = 0

  for (const driveFile of driveFiles) {
    const dbFolderId = driveFile.parentId === appFolderId ? null : (folderIdMap.get(driveFile.parentId) ?? null)
    const existing = existingByProviderId.get(driveFile.id)
    if (!existing) {
      await prisma.file.create({
        data: { userId, connectedAccountId: account.id, provider: 'google_drive', providerFileId: driveFile.id, name: driveFile.name, mimeType: driveFile.mimeType, sizeBytes: driveFile.sizeBytes, status: 'active', folderId: dbFolderId, publicRole: driveFile.publicRole, sharedPeopleCount: driveFile.sharedPeopleCount, thumbnailUrl: driveFile.thumbnailUrl },
      })
      created += 1
      continue
    }

    const needsUpdate = existing.name !== driveFile.name || existing.mimeType !== driveFile.mimeType || existing.sizeBytes !== driveFile.sizeBytes || existing.status !== 'active' || existing.deletedAt !== null || existing.folderId !== dbFolderId || existing.publicRole !== driveFile.publicRole || existing.sharedPeopleCount !== driveFile.sharedPeopleCount || existing.thumbnailUrl !== driveFile.thumbnailUrl
    if (needsUpdate) {
      await prisma.file.update({
        where: { id: existing.id },
        data: { name: driveFile.name, mimeType: driveFile.mimeType, sizeBytes: driveFile.sizeBytes, status: 'active', deletedAt: null, folderId: dbFolderId, publicRole: driveFile.publicRole, sharedPeopleCount: driveFile.sharedPeopleCount, thumbnailUrl: driveFile.thumbnailUrl },
      })
      updated += 1
    }
  }

  const missingActiveIds = existingFiles.filter((file) => file.status === 'active' && !driveFileIds.has(file.providerFileId)).map((file) => file.id)
  if (missingActiveIds.length > 0) {
    const result = await prisma.file.updateMany({ where: { id: { in: missingActiveIds }, userId }, data: { status: 'deleted', deletedAt: new Date() } })
    deleted = result.count
  }

  await syncGoogleQuota(account.id).catch(() => undefined)
  return { accountId: account.id, created, updated, deleted }
}
