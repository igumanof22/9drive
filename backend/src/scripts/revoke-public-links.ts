import { google } from 'googleapis'
import { prisma } from '../config/prisma.js'
import { getAuthedGoogleClient } from '../modules/google/google.service.js'

// Earlier versions published every uploaded file as "anyone with the link can edit".
// This walks the catalog and revokes those grants. Pass --dry-run to only report.
const dryRun = process.argv.includes('--dry-run')

async function main() {
  const files = await prisma.file.findMany({
    where: { provider: 'google_drive' },
    include: { connectedAccount: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`checking ${files.length} Google Drive file(s)${dryRun ? ' (dry run)' : ''}`)

  let publicFiles = 0
  let revoked = 0
  let failed = 0

  for (const file of files) {
    try {
      const drive = google.drive({ version: 'v3', auth: await getAuthedGoogleClient(file.connectedAccount) })
      const permissions = await drive.permissions.list({ fileId: file.providerFileId, fields: 'permissions(id,type,role)' })
      const anyone = (permissions.data.permissions ?? []).filter((permission) => permission.type === 'anyone')
      if (anyone.length === 0) continue

      publicFiles += 1
      console.log(`${dryRun ? 'would revoke' : 'revoking'}: ${file.name} [${anyone.map((p) => p.role).join(', ')}]`)
      if (dryRun) continue

      for (const permission of anyone) {
        await drive.permissions.delete({ fileId: file.providerFileId, permissionId: permission.id! })
        revoked += 1
      }
      await prisma.file.update({ where: { id: file.id }, data: { publicRole: null } })
    } catch (error: any) {
      failed += 1
      console.error(`failed on ${file.name}: ${error.message || error}`)
    }
  }

  console.log(`public files found: ${publicFiles} | grants revoked: ${revoked} | errors: ${failed}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
