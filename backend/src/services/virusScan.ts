import { prisma } from '../lib/prisma'
import { getObjectStream, deleteObjects } from '../lib/minio'
import { scanReadable } from '../lib/clamav'
import { log } from './logger'
import { scanSessions } from '../lib/scanSessions'
import type { PendingTransfer } from '../lib/scanSessions'
import { sendUploadConfirmationEmail } from './email'

export function createScanSession(scanId: string, pending: PendingTransfer): void {
  scanSessions.set(scanId, {
    scanId,
    pending,
    scannedBytes: 0,
    currentFile: pending.files[0]?.name ?? null,
    phase: 'streaming',
    status: 'scanning',
    createdAt: new Date(),
  })
}

// Scans every file of a pending transfer sequentially via clamd, then either
// creates the Transfer record (all clean) or deletes the uploaded objects
// (infected / scan error). Runs detached from the HTTP request that kicked it off
// — progress and the final outcome are read back via GET /api/scan/:scanId.
export async function runTransferScan(scanId: string, ip?: string): Promise<void> {
  const session = scanSessions.get(scanId)
  if (!session) return
  const { pending } = session

  try {
    let scannedSoFar = 0
    for (const file of pending.files) {
      session.currentFile = file.name
      session.phase = 'streaming'
      const stream = await getObjectStream(file.storageKey)
      const baseline = scannedSoFar
      const result = await scanReadable(stream, (scannedBytes, phase) => {
        session.scannedBytes = baseline + scannedBytes
        session.phase = phase
      })
      scannedSoFar += file.size
      session.scannedBytes = scannedSoFar

      if (!result.clean) {
        await deleteObjects(pending.files.map((f) => f.storageKey))

        if (result.virus) {
          session.status = 'infected'
          session.virus = result.virus
          session.infectedFile = file.name
          await log(
            'warn',
            'security',
            `Virus found in upload "${file.name}" (transfer ${pending.shortId}): ${result.virus}`,
            { userId: pending.userId ?? undefined, ip }
          )
        } else {
          session.status = 'error'
          session.errorMessage = result.error || 'Virenscan fehlgeschlagen'
          await log(
            'error',
            'security',
            `Virus scan error for transfer ${pending.shortId}: ${result.error}`,
            { userId: pending.userId ?? undefined, ip }
          )
        }
        return
      }
    }

    const transfer = await prisma.transfer.create({
      data: {
        shortId: pending.shortId,
        userId: pending.userId,
        title: pending.title,
        message: pending.message,
        passwordHash: pending.passwordHash,
        expiresAt: pending.expiresAt,
        notifyEmail: pending.notifyEmail,
        maxDownloads: pending.maxDownloads ?? null,
        totalSize: BigInt(pending.totalSize),
        encrypted: false,
        virusScanned: true,
        files: {
          create: pending.files.map((f) => ({
            name: f.name,
            relativePath: f.relativePath,
            size: BigInt(f.size),
            mimeType: f.mimeType,
            storageKey: f.storageKey,
          })),
        },
      },
      include: { files: true },
    })

    if (pending.userId) {
      await prisma.user.update({
        where: { id: pending.userId },
        data: { storageUsed: { increment: BigInt(pending.totalSize) } },
      })
    }

    await log(
      'info',
      'upload',
      `Transfer uploaded: ${transfer.shortId} — ${transfer.files.length} file(s), ` +
        `${(pending.totalSize / 1024 / 1024).toFixed(1)} MB (virus-scanned)`,
      { userId: pending.userId ?? undefined, ip }
    )

    session.status = 'clean'
    session.result = {
      shortId: transfer.shortId,
      expiresAt: transfer.expiresAt,
      fileCount: transfer.files.length,
      totalSize: pending.totalSize.toString(),
      virusScanned: true,
    }

    if (pending.notifyEmail) {
      sendUploadConfirmationEmail(pending.notifyEmail, transfer.shortId, transfer.title ?? null, transfer.expiresAt).catch(console.error)
    }
  } catch (err) {
    await deleteObjects(pending.files.map((f) => f.storageKey)).catch(() => {})
    session.status = 'error'
    session.errorMessage = (err as Error).message || 'Virenscan fehlgeschlagen'
    await log(
      'error',
      'security',
      `Virus scan crashed for transfer ${pending.shortId}: ${session.errorMessage}`,
      { userId: pending.userId ?? undefined, ip }
    )
  }
}
