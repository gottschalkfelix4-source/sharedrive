import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma'
import { abortMultipartUpload, deleteObjects } from '../lib/minio'
import { Transaction, json, withJob } from '../lib/jobs'
import { TransferSession } from '../lib/uploadSessions'
import { ScanSession } from '../lib/scanSessions'
import { releaseQuota } from '../lib/quota'
import { cleanOldLogs } from './logger'
import { getSettings } from '../routes/settings'

interface Deletion {
  key: string
  uploadId?: string
}
export async function enqueueDeletion(
  objects: Deletion[],
  tx: Transaction = prisma
): Promise<void> {
  if (!objects.length) return
  await tx.job.create({
    data: {
      id: nanoid(32),
      kind: 'delete',
      payload: json(objects),
      expiresAt: new Date('9999-01-01'),
    },
  })
}
export async function deleteTransfer(id: string): Promise<void> {
  await withJob(`transfer:${id}`, async (tx) => {
    const t = await tx.transfer.findUnique({
      where: { id },
      include: { files: true },
    })
    if (!t) return
    await enqueueDeletion(
      t.files.map((f) => ({ key: f.storageKey })),
      tx
    )
    if (t.userId)
      await tx.$executeRaw`UPDATE "User" SET "storageUsed"=GREATEST(0,"storageUsed"-${t.totalSize}) WHERE "id"=${t.userId}`
    await tx.transfer.delete({ where: { id } })
  })
}
export async function cleanupOnce(): Promise<void> {
  const expired = await prisma.transfer.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  })
  for (const t of expired) await deleteTransfer(t.id)
  const jobs = await prisma.job.findMany({
    where: {
      kind: { in: ['upload', 'scan'] },
      expiresAt: { lte: new Date() },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    take: 100,
  })
  for (const job of jobs)
    await withJob(job.id, async (tx) => {
      const current = await tx.job.findUnique({ where: { id: job.id } })
      if (
        !current ||
        current.expiresAt > new Date() ||
        (current.leaseUntil && current.leaseUntil > new Date())
      )
        return
      if (current.kind === 'upload' && current.status === 'pending') {
        const s = current.payload as unknown as TransferSession
        await enqueueDeletion(
          Object.values(s.files).map((f) => ({
            key: f.storageKey,
            uploadId: f.uploadId || undefined,
          })),
          tx
        )
        await releaseQuota(tx, s.userId, s.totalSize)
      } else if (current.status === 'pending') {
        const s = current.payload as unknown as ScanSession
        await enqueueDeletion(
          s.pending.files.map((f) => ({ key: f.storageKey })),
          tx
        )
        await releaseQuota(tx, s.pending.userId, s.pending.totalSize)
      }
      await tx.job.delete({ where: { id: job.id } })
    })
  const deletions = await prisma.job.findMany({
    where: { kind: 'delete' },
    take: 100,
  })
  for (const job of deletions) {
    try {
      for (const object of job.payload as unknown as Deletion[]) {
        if (object.uploadId) {
          try {
            await abortMultipartUpload(object.key, object.uploadId)
          } catch (err) {
            if ((err as { code?: string }).code !== 'NoSuchUpload') throw err
          }
        }
        await deleteObjects([object.key])
      }
      await prisma.job.deleteMany({ where: { id: job.id } })
    } catch {
      console.error('Object cleanup deferred; durable retry retained')
    }
  }
  const settings = await getSettings()
  await cleanOldLogs(Number(settings['privacy.logRetentionDays']))
}
export function startCleanupService(): () => void {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await cleanupOnce()
    } catch {
      console.error('Cleanup deferred')
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void run(), 60_000)
  void run()
  return () => clearInterval(timer)
}
