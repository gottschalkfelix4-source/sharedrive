import { prisma } from './prisma'
import { AppError } from '../middleware/errorHandler'

// A slot means an accepted file/ZIP download attempt, including client aborts.
export async function reserveDownload(id: string): Promise<void> {
  const changed = await prisma.$executeRaw`
    UPDATE "Transfer" SET "downloadCount"="downloadCount"+1
    WHERE "id"=${id} AND "expiresAt">NOW() AND ("maxDownloads" IS NULL OR "downloadCount"<"maxDownloads")`
  if (changed !== 1)
    throw new AppError('Download limit reached or transfer expired', 410)
}
