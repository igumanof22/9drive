import { app } from './app.js'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'

// The nightly MySQL event does the routine cleanup, but MySQL never replays an execution
// it missed while the server was down. Sweeping once at startup covers exactly that gap.
async function purgeDeadShareLinks() {
  const result = await prisma.fileShare.deleteMany({
    where: { OR: [{ enabled: false }, { expiresAt: { lt: new Date() } }] },
  })
  if (result.count > 0) console.log(`Purged ${result.count} revoked or expired share link(s)`)
}

purgeDeadShareLinks().catch((error) => {
  console.error('Failed to purge dead share links:', error instanceof Error ? error.message : error)
})

app.listen(env.APP_PORT, () => {
  console.log(`Backend running on http://localhost:${env.APP_PORT}`)
})
