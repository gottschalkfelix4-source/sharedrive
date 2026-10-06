import { Transaction } from './jobs'
import { AppError } from '../middleware/errorHandler'

export async function reserveQuota(
  tx: Transaction,
  userId: string | null,
  bytes: number,
  limit: number
): Promise<void> {
  if (!userId) return
  const changed = await tx.$executeRaw`
    UPDATE "User" SET "storageReserved" = "storageReserved" + ${BigInt(bytes)}
    WHERE "id" = ${userId} AND (${BigInt(limit)} = 0 OR "storageUsed" + "storageReserved" + ${BigInt(bytes)} <= ${BigInt(limit)})`
  if (changed !== 1) throw new AppError('Storage quota exceeded', 413)
}
export async function releaseQuota(
  tx: Transaction,
  userId: string | null,
  bytes: number,
  publish = false
): Promise<void> {
  if (!userId) return
  await tx.$executeRaw`
    UPDATE "User" SET "storageReserved" = GREATEST(0, "storageReserved" - ${BigInt(bytes)}),
      "storageUsed" = "storageUsed" + ${publish ? BigInt(bytes) : 0n}
    WHERE "id" = ${userId}`
}
