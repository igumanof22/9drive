import { Router } from 'express'
import { google } from 'googleapis'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { requireAuth, type AuthRequest } from '../../middleware/auth.middleware.js'
import { hashToken, randomToken } from '../../utils/crypto.js'
import { ensureGoogleAppFolder, getAuthedGoogleClient, syncGoogleAppFolderFiles, syncGoogleQuota } from '../google/google.service.js'
import { deleteS3Object, syncS3Quota, createS3Client, getS3ConfigForAccount } from '../s3/s3.service.js'
import { streamProviderFile } from './stream-file.js'
import { googleDownloadExportMimeTypes, normalizeHeaders, withExtension } from './stream-google-file.js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { ZipArchive } from 'archiver'
import { createAuditLog } from '../../utils/audit.js'



export const fileRouter = Router()

fileRouter.get('/preview/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token)
    const preview = await prisma.filePreviewToken.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
      include: { file: { include: { connectedAccount: true } } },
    })
    if (!preview || preview.file.status !== 'active') return res.status(404).json({ code: 'PREVIEW_NOT_FOUND', message: 'Preview token not found.' })
    return streamProviderFile(preview.file, req.headers.range, res, { disposition: 'inline' })
  } catch (error) {
    return next(error)
  }
})

fileRouter.use(requireAuth)

fileRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const query = z.object({
      folderId: z.string().optional(),
      q: z.string().trim().max(255).optional(),
      kind: z.enum(['image', 'video', 'pdf', 'doc', 'archive']).optional(),
      accountId: z.string().optional(),
      minSize: z.coerce.number().optional(),
      maxSize: z.coerce.number().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional()
    }).parse(req.query)

    const typeFilters: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      video: ['video/mp4', 'video/mpeg', 'video/ogg', 'video/quicktime', 'video/webm'],
      pdf: ['application/pdf'],
      doc: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
      archive: ['application/zip', 'application/x-rar-compressed', 'application/x-tar', 'application/x-7z-compressed']
    }

    const where: any = {
      userId: req.user!.id,
      status: 'active',
      ...(query.folderId ? { folderId: query.folderId } : {}),
      ...(query.q ? { name: { contains: query.q } } : {}),
      ...(query.accountId ? { connectedAccountId: query.accountId } : {}),
      ...(query.kind ? { mimeType: { in: typeFilters[query.kind] || [] } } : {}),
      ...(query.minSize !== undefined || query.maxSize !== undefined ? {
        sizeBytes: {
          ...(query.minSize !== undefined ? { gte: BigInt(query.minSize) } : {}),
          ...(query.maxSize !== undefined ? { lte: BigInt(query.maxSize) } : {})
        }
      } : {}),
      ...(query.startDate || query.endDate ? {
        createdAt: {
          ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
          ...(query.endDate ? { lte: new Date(query.endDate) } : {})
        }
      } : {})
    }

    const files = await prisma.file.findMany({
      where,
      include: {
        connectedAccount: { select: { id: true, email: true, provider: true, avatarUrl: true } },
        folder: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    return res.json({ files: files.map((file) => ({ ...file, sizeBytes: file.sizeBytes.toString() })) })
  } catch (error) {
    return next(error)
  }
})

const batchFileSchema = z.object({ fileIds: z.array(z.string().min(1)).min(1).max(100) })

fileRouter.patch('/batch', async (req: AuthRequest, res, next) => {
  try {
    const body = batchFileSchema.extend({ folderId: z.string().nullable().optional() }).parse(req.body)
    if (body.folderId) await prisma.folder.findFirstOrThrow({ where: { id: body.folderId, userId: req.user!.id, deletedAt: null } })
    const result = await prisma.file.updateMany({ where: { id: { in: body.fileIds }, userId: req.user!.id, status: 'active' }, data: { folderId: body.folderId ?? null } })
    await createAuditLog(req.user!.id, 'MOVE_FILES', 'file', undefined, { count: result.count, folderId: body.folderId })
    return res.json({ status: 'ok', moved: result.count })
  } catch (error) {
    return next(error)
  }
})

fileRouter.delete('/batch', async (req: AuthRequest, res, next) => {
  try {
    const body = batchFileSchema.parse(req.body)
    const files = await prisma.file.findMany({ where: { id: { in: body.fileIds }, userId: req.user!.id, status: 'active' } })
    const result = await prisma.file.updateMany({
      where: { id: { in: body.fileIds }, userId: req.user!.id, status: 'active' },
      data: { status: 'deleted', deletedAt: new Date() }
    })
    for (const f of files) {
      await createAuditLog(req.user!.id, 'TRASH_FILE', 'file', f.id, { name: f.name })
    }
    return res.json({ status: 'ok', deleted: result.count })
  } catch (error) {
    return next(error)
  }
})

fileRouter.get('/trash', async (req: AuthRequest, res, next) => {
  try {
    const query = z.object({ q: z.string().trim().max(255).optional() }).parse(req.query)
    const files = await prisma.file.findMany({
      where: {
        userId: req.user!.id,
        status: 'deleted',
        ...(query.q ? { name: { contains: query.q } } : {})
      },
      include: {
        connectedAccount: { select: { id: true, email: true, provider: true, avatarUrl: true } },
        folder: { select: { id: true, name: true } }
      },
      orderBy: { deletedAt: 'desc' }
    })
    return res.json({ files: files.map((file) => ({ ...file, sizeBytes: file.sizeBytes.toString() })) })
  } catch (error) {
    return next(error)
  }
})

fileRouter.post('/batch/restore', async (req: AuthRequest, res, next) => {
  try {
    const body = batchFileSchema.parse(req.body)
    const files = await prisma.file.findMany({ where: { id: { in: body.fileIds }, userId: req.user!.id, status: 'deleted' } })
    const result = await prisma.file.updateMany({
      where: { id: { in: body.fileIds }, userId: req.user!.id, status: 'deleted' },
      data: { status: 'active', deletedAt: null }
    })
    for (const f of files) {
      await createAuditLog(req.user!.id, 'RESTORE_FILE', 'file', f.id, { name: f.name })
    }
    return res.json({ status: 'ok', restored: result.count })
  } catch (error) {
    return next(error)
  }
})

fileRouter.delete('/batch/permanent', async (req: AuthRequest, res, next) => {
  try {
    const body = batchFileSchema.parse(req.body)
    const files = await prisma.file.findMany({
      where: { id: { in: body.fileIds }, userId: req.user!.id, status: 'deleted' },
      include: { connectedAccount: true }
    })
    const deletedIds: string[] = []
    const syncedAccountIds = new Set<string>()
    const failed: Array<{ fileId: string; message: string }> = []

    for (const file of files) {
      try {
        if (file.provider === 's3') {
          await deleteS3Object(file)
        } else {
          const auth = await getAuthedGoogleClient(file.connectedAccount)
          const drive = google.drive({ version: 'v3', auth })
          await drive.files.delete({ fileId: file.providerFileId })
        }
        deletedIds.push(file.id)
        syncedAccountIds.add(file.connectedAccountId)
        await createAuditLog(req.user!.id, 'PERMANENT_DELETE_FILE', 'file', file.id, { name: file.name })
      } catch (error) {
        failed.push({ fileId: file.id, message: error instanceof Error ? error.message : 'Delete failed' })
      }
    }

    if (deletedIds.length > 0) {
      await prisma.file.deleteMany({
        where: { id: { in: deletedIds }, userId: req.user!.id }
      })
    }

    for (const accountId of syncedAccountIds) {
      const account = files.find((file) => file.connectedAccountId === accountId)?.connectedAccount
      if (account?.provider === 's3') {
        await syncS3Quota(accountId).catch(() => undefined)
      } else {
        await syncGoogleQuota(accountId).catch(() => undefined)
      }
    }

    if (deletedIds.length === 0 && failed.length > 0) {
      return res.status(400).json({ code: 'FILES_DELETE_FAILED', message: 'No files were permanently deleted.', deleted: 0, failed })
    }
    return res.json({ status: 'ok', deleted: deletedIds.length, failed })
  } catch (error) {
    return next(error)
  }
})

fileRouter.get('/shared-links', async (req: AuthRequest, res, next) => {
  try {
    const shares = await prisma.fileShare.findMany({
      where: { userId: req.user!.id, enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { file: { include: { connectedAccount: { select: { email: true, provider: true } }, folder: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({
      shares: shares.filter((share) => share.file.status === 'active').map((share) => {
        const url = share.token ? `${env.FRONTEND_URL}/public/files/${share.token}` : null
        return {
          id: share.id,
          url,
          createdAt: share.createdAt.toISOString(),
          expiresAt: share.expiresAt?.toISOString() ?? null,
          file: { ...share.file, sizeBytes: share.file.sizeBytes.toString() },
        }
      })
    })
  } catch (error) {
    return next(error)
  }
})

fileRouter.post('/sync-google', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ connectedAccountId: z.string().min(1).optional() }).parse(req.body ?? {})
    const accounts = await prisma.connectedAccount.findMany({
      where: { userId: req.user!.id, provider: 'google_drive', status: 'connected', ...(body.connectedAccountId ? { id: body.connectedAccountId } : {}) },
      select: { id: true },
    })

    const results = []
    for (const account of accounts) results.push(await syncGoogleAppFolderFiles(account.id, req.user!.id))

    return res.json({
      status: 'ok',
      results,
    })
  } catch (error) {
    return next(error)
  }
})

fileRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const fileId = String(req.params.id)
    const file = await prisma.file.findFirstOrThrow({ where: { id: fileId, userId: req.user!.id }, include: { connectedAccount: { select: { id: true, email: true, provider: true, avatarUrl: true } }, folder: { select: { id: true, name: true } } } })
    return res.json({ file: { ...file, sizeBytes: file.sizeBytes.toString() } })
  } catch (error) {
    return next(error)
  }
})

fileRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ name: z.string().min(1).max(255).optional(), folderId: z.string().nullable().optional() }).parse(req.body)
    const fileId = String(req.params.id)
    const file = await prisma.file.findFirstOrThrow({ where: { id: fileId, userId: req.user!.id }, include: { connectedAccount: true } })
    const drive = file.provider === 's3' ? null : google.drive({ version: 'v3', auth: await getAuthedGoogleClient(file.connectedAccount) })
    if (body.folderId) await prisma.folder.findFirstOrThrow({ where: { id: body.folderId, userId: req.user!.id, deletedAt: null } })
    if (body.name && drive) await drive.files.update({ fileId: file.providerFileId, requestBody: { name: body.name } })
    const updated = await prisma.file.update({ where: { id: file.id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.folderId !== undefined ? { folderId: body.folderId } : {}) }, include: { connectedAccount: { select: { id: true, email: true, provider: true, avatarUrl: true } }, folder: { select: { id: true, name: true } } } })
    await createAuditLog(req.user!.id, 'UPDATE_FILE', 'file', updated.id, { name: updated.name, updates: body })
    return res.json({ file: { ...updated, sizeBytes: updated.sizeBytes.toString() } })
  } catch (error) {
    return next(error)
  }
})

// Moves a file to another connected Google account. Drive has no cross-account move, so
// the target account is granted read access and copies the file itself: ownership follows
// the copy and the bytes never travel through this server.
fileRouter.post('/:id/move-account', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ targetAccountId: z.string().min(1) }).parse(req.body)
    const fileId = String(req.params.id)
    const file = await prisma.file.findFirstOrThrow({
      where: { id: fileId, userId: req.user!.id, status: 'active' },
      include: { connectedAccount: true },
    })
    if (file.provider !== 'google_drive') {
      return res.status(400).json({ code: 'UNSUPPORTED_PROVIDER', message: 'Only Google Drive files can be moved between accounts.' })
    }
    if (file.connectedAccountId === body.targetAccountId) {
      return res.status(400).json({ code: 'SAME_ACCOUNT', message: 'File already lives in that account.' })
    }

    const target = await prisma.connectedAccount.findFirstOrThrow({
      where: { id: body.targetAccountId, userId: req.user!.id, provider: 'google_drive', status: 'connected' },
    })

    // Refuse before touching Drive when the target cannot hold the file.
    await syncGoogleQuota(target.id).catch(() => undefined)
    const targetStorage = await prisma.storageAccount.findUnique({ where: { connectedAccountId: target.id } })
    if (targetStorage?.availableBytes !== null && targetStorage?.availableBytes !== undefined && targetStorage.availableBytes < file.sizeBytes) {
      return res.status(409).json({ code: 'TARGET_QUOTA_EXCEEDED', message: 'Not enough free space in the destination account.' })
    }

    const sourceDrive = google.drive({ version: 'v3', auth: await getAuthedGoogleClient(file.connectedAccount) })
    const targetDrive = google.drive({ version: 'v3', auth: await getAuthedGoogleClient(target) })
    const targetFolderId = await ensureGoogleAppFolder(target)

    let permissionId: string | null = null
    let copyId: string | null = null
    try {
      const permission = await sourceDrive.permissions.create({
        fileId: file.providerFileId,
        requestBody: { type: 'user', role: 'reader', emailAddress: target.email },
        sendNotificationEmail: false,
        fields: 'id',
      })
      permissionId = permission.data.id ?? null

      const copied = await targetDrive.files.copy({
        fileId: file.providerFileId,
        requestBody: { name: file.name, parents: [targetFolderId] },
        fields: 'id',
      })
      copyId = copied.data.id ?? null
      if (!copyId) throw new Error('Google did not return the copied file id.')

      await sourceDrive.files.delete({ fileId: file.providerFileId })
    } catch (error) {
      // Leave both accounts as they were rather than duplicating the file.
      if (copyId) await targetDrive.files.delete({ fileId: copyId }).catch(() => undefined)
      if (permissionId) await sourceDrive.permissions.delete({ fileId: file.providerFileId, permissionId }).catch(() => undefined)
      throw error
    }

    // The grant lived on the source file, which is gone, so there is nothing left to revoke.

    // Virtual folders belong to a single account, so a moved file returns to the root.
    const updated = await prisma.file.update({
      where: { id: file.id },
      data: { connectedAccountId: target.id, providerFileId: copyId, folderId: null },
      include: { connectedAccount: { select: { id: true, email: true, provider: true, avatarUrl: true } }, folder: { select: { id: true, name: true } } },
    })
    await createAuditLog(req.user!.id, 'MOVE_FILE_ACCOUNT', 'file', updated.id, {
      name: updated.name,
      fromAccountId: file.connectedAccountId,
      toAccountId: target.id,
    })
    await Promise.allSettled([syncGoogleQuota(file.connectedAccountId), syncGoogleQuota(target.id)])

    return res.json({ file: { ...updated, sizeBytes: updated.sizeBytes.toString() } })
  } catch (error) {
    return next(error)
  }
})

fileRouter.post('/:id/share', async (req: AuthRequest, res, next) => {
  try {
    const fileId = String(req.params.id)
    const file = await prisma.file.findFirstOrThrow({ where: { id: fileId, userId: req.user!.id, status: 'active' } })
    const existingShare = await prisma.fileShare.findFirst({ where: { fileId: file.id, userId: req.user!.id, enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' } })

    let shareId = existingShare?.id
    let token = existingShare?.token
    if (!existingShare) {
      token = randomToken(32)
      const share = await prisma.fileShare.create({ data: { fileId: file.id, userId: req.user!.id, token, tokenHash: hashToken(token) } })
      shareId = share.id
    }

    return res.status(existingShare ? 200 : 201).json({ url: `${env.FRONTEND_URL}/public/files/${token}`, shareId })
  } catch (error) {
    return next(error)
  }
})

// Link-level access on Drive itself. Nothing here happens implicitly: a file is private
// until this endpoint is called, and the caller states which role the link carries.
const publicRoles = ['reader', 'commenter', 'writer'] as const

async function googleDriveFileFor(userId: string, fileId: string) {
  const file = await prisma.file.findFirstOrThrow({ where: { id: fileId, userId }, include: { connectedAccount: true } })
  if (file.provider !== 'google_drive') return { file, drive: null }
  const auth = await getAuthedGoogleClient(file.connectedAccount)
  return { file, drive: google.drive({ version: 'v3', auth }) }
}

async function anyonePermissionsOf(drive: any, providerFileId: string) {
  const permissions = await drive.permissions.list({ fileId: providerFileId, fields: 'permissions(id,type,role)' })
  return (permissions.data.permissions ?? []).filter((permission: any) => permission.type === 'anyone')
}

fileRouter.get('/:id/public-permission', async (req: AuthRequest, res, next) => {
  try {
    const { file, drive } = await googleDriveFileFor(req.user!.id, String(req.params.id))
    if (!drive) return res.json({ role: null, url: null })
    const anyone = await anyonePermissionsOf(drive, file.providerFileId)
    if (anyone.length === 0) return res.json({ role: null, url: null })
    const metadata = await drive.files.get({ fileId: file.providerFileId, fields: 'webViewLink,webContentLink' })
    return res.json({ role: anyone[0].role, url: metadata.data.webViewLink ?? metadata.data.webContentLink })
  } catch (error) {
    return next(error)
  }
})

fileRouter.post('/:id/public-permission', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ role: z.enum(publicRoles) }).parse(req.body ?? {})
    const { file, drive } = await googleDriveFileFor(req.user!.id, String(req.params.id))
    if (!drive) {
      return res.status(400).json({ code: 'UNSUPPORTED_PROVIDER', message: 'Only Google Drive files can be shared by link.' })
    }
    // Replace instead of stacking, so the stated role is the only one in effect.
    for (const permission of await anyonePermissionsOf(drive, file.providerFileId)) {
      await drive.permissions.delete({ fileId: file.providerFileId, permissionId: permission.id })
    }
    await drive.permissions.create({ fileId: file.providerFileId, requestBody: { role: body.role, type: 'anyone' } })
    const metadata = await drive.files.get({ fileId: file.providerFileId, fields: 'webViewLink,webContentLink' })
    await createAuditLog(req.user!.id, 'SET_FILE_PUBLIC_ACCESS', 'file', file.id, { name: file.name, role: body.role })
    return res.json({ status: 'ok', role: body.role, url: metadata.data.webViewLink ?? metadata.data.webContentLink })
  } catch (error) {
    return next(error)
  }
})

fileRouter.delete('/:id/public-permission', async (req: AuthRequest, res, next) => {
  try {
    const { file, drive } = await googleDriveFileFor(req.user!.id, String(req.params.id))
    if (!drive) return res.json({ status: 'ok', revoked: 0 })
    const anyone = await anyonePermissionsOf(drive, file.providerFileId)
    for (const permission of anyone) {
      await drive.permissions.delete({ fileId: file.providerFileId, permissionId: permission.id })
    }
    await createAuditLog(req.user!.id, 'REVOKE_FILE_PUBLIC_ACCESS', 'file', file.id, { name: file.name, revoked: anyone.length })
    return res.json({ status: 'ok', revoked: anyone.length })
  } catch (error) {
    return next(error)
  }
})

fileRouter.delete('/:id/share', async (req: AuthRequest, res, next) => {
  try {
    const fileId = String(req.params.id)
    await prisma.fileShare.updateMany({ where: { fileId, userId: req.user!.id, enabled: true }, data: { enabled: false } })
    return res.json({ status: 'ok' })
  } catch (error) {
    return next(error)
  }
})

fileRouter.post('/:id/preview-token', async (req: AuthRequest, res, next) => {
  try {
    const fileId = String(req.params.id)
    const file = await prisma.file.findFirstOrThrow({ where: { id: fileId, userId: req.user!.id, status: 'active' } })
    const token = randomToken(32)
    await prisma.filePreviewToken.create({ data: { fileId: file.id, userId: req.user!.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 10 * 60_000) } })
    const path = `/files/preview/${token}`
    return res.status(201).json({ path, url: `${req.protocol}://${req.get('host')}${path}` })
  } catch (error) {
    return next(error)
  }
})

fileRouter.get('/:id/view-url', async (req: AuthRequest, res, next) => {
  try {
    const fileId = String(req.params.id)
    const file = await prisma.file.findFirstOrThrow({ where: { id: fileId, userId: req.user!.id }, include: { connectedAccount: true } })
    if (file.provider === 's3') return res.json({ url: null })
    const auth = await getAuthedGoogleClient(file.connectedAccount)
    const drive = google.drive({ version: 'v3', auth })

    const metadata = await drive.files.get({ fileId: file.providerFileId, fields: 'webViewLink,webContentLink' })
    return res.json({ url: metadata.data.webViewLink ?? metadata.data.webContentLink })
  } catch (error) {
    return next(error)
  }
})

fileRouter.get('/:id/download', async (req: AuthRequest, res, next) => {
  try {
    const fileId = String(req.params.id)
    const file = await prisma.file.findFirstOrThrow({ where: { id: fileId, userId: req.user!.id }, include: { connectedAccount: true } })
    return streamProviderFile(file, req.headers.range, res, { disposition: 'attachment' })
  } catch (error) {
    return next(error)
  }
})

fileRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const fileId = String(req.params.id)
    const file = await prisma.file.findFirstOrThrow({ where: { id: fileId, userId: req.user!.id, status: 'active' } })
    await prisma.file.update({ where: { id: file.id }, data: { status: 'deleted', deletedAt: new Date() } })
    await createAuditLog(req.user!.id, 'TRASH_FILE', 'file', file.id, { name: file.name })
    return res.json({ status: 'ok' })
  } catch (error) {
    return next(error)
  }
})

fileRouter.post('/batch-download', async (req: AuthRequest, res, next) => {
  try {
    const body = batchFileSchema.parse(req.body)
    const files = await prisma.file.findMany({
      where: { id: { in: body.fileIds }, userId: req.user!.id, status: 'active' },
      include: { connectedAccount: true }
    })
    if (files.length === 0) return res.status(404).json({ code: 'FILES_NOT_FOUND', message: 'No files found.' })

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="9drive-download.zip"')

    const archive = new ZipArchive({ zlib: { level: 9 } })
    archive.on('error', (err: any) => {
      throw err
    })
    archive.pipe(res)

    for (const file of files) {
      try {
        let stream: Readable
        let fileName = file.name
        if (file.provider === 's3') {
          const config = await getS3ConfigForAccount(file.connectedAccountId)
          const client = createS3Client(config)
          const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: file.providerFileId }))
          stream = response.Body as Readable
        } else {
          const auth = await getAuthedGoogleClient(file.connectedAccount)
          const headers = normalizeHeaders(await auth.getRequestHeaders())
          const exportTarget = googleDownloadExportMimeTypes[file.mimeType]
          if (exportTarget) {
            fileName = withExtension(file.name, exportTarget.extension)
          }
          const url = exportTarget
            ? `https://www.googleapis.com/drive/v3/files/${file.providerFileId}/export?mimeType=${encodeURIComponent(exportTarget.mimeType)}`
            : `https://www.googleapis.com/drive/v3/files/${file.providerFileId}?alt=media`
          const response = await fetch(url, { headers })
          if (!response.ok || !response.body) continue
          stream = Readable.fromWeb(response.body as any)
        }
        archive.append(stream, { name: fileName })
      } catch (err) {
        console.error(`Failed to add file ${file.name} to zip:`, err)
      }
    }

    await archive.finalize()
  } catch (error) {
    return next(error)
  }
})
