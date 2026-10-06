import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type Transaction = Prisma.TransactionClient
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value))
}
export function withJob<T>(
  id: string,
  operation: (tx: Transaction) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
      return operation(tx)
    },
    { maxWait: 30_000, timeout: 120_000 }
  )
}
export class PersistentMap<T> {
  constructor(public kind: string) {}
  async get(id: string, tx: Transaction = prisma): Promise<T | undefined> {
    const job = await tx.job.findUnique({ where: { id } })
    if (!job || job.kind !== this.kind || job.expiresAt < new Date())
      return undefined
    return job.payload as unknown as T
  }
  async set(id: string, value: T, tx: Transaction = prisma): Promise<void> {
    await tx.job.upsert({
      where: { id },
      create: {
        id,
        kind: this.kind,
        payload: json(value),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: { payload: json(value) },
    })
  }
  async delete(id: string, tx: Transaction = prisma): Promise<void> {
    await tx.job.deleteMany({ where: { id, kind: this.kind } })
  }
  async count(): Promise<number> {
    return prisma.job.count({
      where: {
        kind: this.kind,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    })
  }
}
