import cron from 'node-cron'
import { prisma } from '../lib/prisma'
import { deleteObjects } from '../lib/minio'
import { cleanOldLogs } from './logger'
import { getSettings } from '../routes/settings'

export function startCleanupService(): void {
  cron.schedule('0 * * * *', async () => {
    try {
      const expired = await prisma.transfer.findMany({
        where: { expiresAt: { lte: new Date() } },
        include: { files: { select: { storageKey: true } } },
      })

      if (expired.length > 0) {
        const allKeys = expired.flatMap((t) => t.files.map((f) => f.storageKey))
        await deleteObjects(allKeys)

        for (const transfer of expired) {
          if (transfer.userId && transfer.totalSize > 0) {
            await prisma.user.update({
              where: { id: transfer.userId },
              data: { storageUsed: { decrement: transfer.totalSize } },
            })
          }
        }

        await prisma.transfer.deleteMany({
          where: { id: { in: expired.map((t) => t.id) } },
        })

        console.log(`Cleanup: deleted ${expired.length} expired transfers`)
      }
    } catch (err) {
      console.error('Cleanup error:', err)
    }
  })

  // Clean old logs daily at 03:00 — retention configurable via admin settings
  cron.schedule('0 3 * * *', async () => {
    try {
      const settings = await getSettings()
      const days = parseInt(settings['privacy.logRetentionDays'] || '30')
      await cleanOldLogs(days)
    } catch (err) {
      console.error('Log cleanup error:', err)
    }
  })

  console.log('Cleanup service started')
}
