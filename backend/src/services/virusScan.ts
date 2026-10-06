import { prisma } from '../lib/prisma'
import { getObjectStream } from '../lib/minio'
import { scanReadable } from '../lib/clamav'
import { scanSessions, PendingTransfer } from '../lib/scanSessions'
import { randomUUID } from 'crypto'
import { Transaction, json, withJob } from '../lib/jobs'
import { releaseQuota } from '../lib/quota'
import { log } from './logger'
import { enqueueDeletion } from './cleanup'
import { notifyPublished } from './published'

export async function createScanSession(
  scanId: string,
  pending: PendingTransfer,
  tx: Transaction = prisma
): Promise<void> {
  await scanSessions.set(
    scanId,
    {
      scanId,
      pending,
      scannedBytes: 0,
      currentFile: null,
      phase: 'streaming',
      status: 'scanning',
      createdAt: new Date(),
    },
    tx
  )
}
export async function publishTransfer(
  pending: PendingTransfer,
  scanned: boolean,
  tx: Transaction = prisma
) {
  const transfer = await tx.transfer.create({
    data: {
      shortId: pending.shortId,
      userId: pending.userId,
      title: pending.title,
      message: pending.message,
      passwordHash: pending.passwordHash,
      expiresAt: new Date(pending.expiresAt),
      notifyEmail: pending.notifyEmail,
      maxDownloads: pending.maxDownloads ?? null,
      totalSize: BigInt(pending.totalSize),
      encrypted: pending.encrypted ?? false,
      virusScanned: scanned,
      encryptedManifest: pending.encryptedManifest,
      encryptionVersion: pending.encryptionVersion ?? 1,
      encryptionContext: pending.encryptionContext,
      files: {
        create: pending.files.map((f) => ({
          name: f.name,
          encryptionIndex: f.encryptionIndex,
          relativePath: f.relativePath,
          size: BigInt(f.size),
          storedSize: BigInt(f.storedSize ?? f.size),
          mimeType: f.mimeType,
          storageKey: f.storageKey,
        })),
      },
    },
    include: { files: true },
  })
  await releaseQuota(tx, pending.userId, pending.totalSize, true)
  return {
    shortId: transfer.shortId,
    expiresAt: transfer.expiresAt,
    fileCount: transfer.files.length,
    totalSize: transfer.totalSize.toString(),
    virusScanned: scanned,
  }
}

// A bounded durable worker; leases recover interrupted scans after a process restart.
export async function runTransferScan(scanId: string): Promise<void> {
  const owner = randomUUID()
  const claimed = await prisma.job.updateMany({
    where: {
      id: scanId,
      kind: 'scan',
      status: 'pending',
      expiresAt: { gt: new Date() },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 120_000) },
  })
  if (!claimed.count) return
  const session = await scanSessions.get(scanId)
  if (!session) return
  session.scannedBytes = 0
  const save = async () => {
    const updated = await prisma.job.updateMany({
      where: { id: scanId, status: 'pending', leaseOwner: owner },
      data: { payload: json(session) },
    })
    if (!updated.count) throw new Error('Scan lease lost')
  }
  const heartbeat = setInterval(() => {
    void prisma.job
      .updateMany({
        where: { id: scanId, status: 'pending', leaseOwner: owner },
        data: { leaseUntil: new Date(Date.now() + 120_000) },
      })
      .catch(() => {})
  }, 30_000)
  let progressSaving: Promise<void> | undefined
  const progressTimer = setInterval(() => {
    if (!progressSaving)
      progressSaving = save()
        .catch(() => {})
        .finally(() => {
          progressSaving = undefined
        })
  }, 1000)
  try {
    for (const file of session.pending.files) {
      session.currentFile = file.name
      await save()
      const stream = await getObjectStream(file.storageKey)
      const baseline = session.scannedBytes
      session.phase = 'streaming'
      const result = await scanReadable(stream, (bytes, phase) => {
        session.scannedBytes = baseline + bytes
        session.phase = phase
      })
      if (progressSaving) await progressSaving
      if (!result.clean) {
        if (!result.virus) throw new Error('Scanner temporarily unavailable')
        session.status = 'infected'
        session.virus = result.virus
        session.infectedFile = result.virus ? file.name : undefined
        session.errorMessage = result.error
        break
      }
      session.scannedBytes = baseline + file.size
      await save()
    }
    clearInterval(progressTimer)
    if (progressSaving) await progressSaving
    const committed = await withJob(scanId, async (tx) => {
      const job = await tx.job.findUnique({ where: { id: scanId } })
      if (!job || job.status !== 'pending' || job.leaseOwner !== owner)
        return false
      if (session.status === 'scanning') {
        session.result = await publishTransfer(session.pending, true, tx)
        session.status = 'clean'
      } else {
        await enqueueDeletion(
          session.pending.files.map((f) => ({ key: f.storageKey })),
          tx
        )
        await releaseQuota(
          tx,
          session.pending.userId,
          session.pending.totalSize
        )
      }
      await scanSessions.set(scanId, session, tx)
      await tx.job.update({
        where: { id: scanId },
        data: { status: 'done', leaseUntil: null, leaseOwner: null },
      })
      return true
    })
    if (!committed) return
    await log(
      session.status === 'clean' ? 'info' : 'warn',
      'security',
      `Transfer scan ${session.status}: ${session.pending.shortId}`
    )
    if (session.status === 'clean')
      void notifyPublished(session.pending.shortId, session.pending.ip).catch(
        () => {}
      )
  } catch (err) {
    // Keep the job and quota reservation for retry rather than publishing or losing it.
    await log(
      'error',
      'security',
      `Scan job temporarily unavailable: ${scanId}`
    )
    await prisma.job.updateMany({
      where: { id: scanId, status: 'pending', leaseOwner: owner },
      data: { leaseUntil: new Date(Date.now() + 60_000) },
    })
  } finally {
    clearInterval(heartbeat)
    clearInterval(progressTimer)
  }
}

export function startScanWorker(): () => void {
  const active = new Set<string>()
  let polling = false
  const poll = async () => {
    if (polling || active.size >= 2) return
    polling = true
    try {
      const jobs = await prisma.job.findMany({
        where: {
          kind: 'scan',
          status: 'pending',
          expiresAt: { gt: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        take: 2 - active.size,
        orderBy: { createdAt: 'asc' },
      })
      for (const job of jobs) {
        active.add(job.id)
        void runTransferScan(job.id)
          .catch(console.error)
          .finally(() => active.delete(job.id))
      }
    } catch (err) {
      console.error('Scan worker poll failed')
    } finally {
      polling = false
    }
  }
  const timer = setInterval(() => void poll(), 2000)
  void poll()
  return () => clearInterval(timer)
}
