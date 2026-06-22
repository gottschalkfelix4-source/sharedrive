import { Router } from 'express'
import bcrypt from 'bcryptjs'
import archiver from 'archiver'
import rateLimit from 'express-rate-limit'
import { Readable } from 'stream'
import { prisma } from '../lib/prisma'
import { getObjectStream } from '../lib/minio'
import { AppError } from '../middleware/errorHandler'
import { sendDownloadNotification } from '../services/email'
import { log } from '../services/logger'
import { incrementDownloads, decrementDownloads } from '../lib/liveCounters'

// Each AES-GCM encrypted chunk adds 12 bytes IV + 16 bytes auth tag overhead
const ENC_OVERHEAD = 28
const ENC_CHUNK_SIZE = 8 * 1024 * 1024  // must match frontend CHUNK_SIZE

function encryptedFileSize(plaintextSize: number): number {
  const numChunks = Math.ceil(plaintextSize / ENC_CHUNK_SIZE)
  return plaintextSize + numChunks * ENC_OVERHEAD
}

const router = Router()

// Bounds password-guessing against passwordHash — generous enough for normal
// multi-file downloads, tight enough to make brute-forcing impractical per IP.
const downloadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false })
router.use(downloadLimiter)

async function getTransferOrThrow(shortId: string, password?: string) {
  const transfer = await prisma.transfer.findUnique({
    where: { shortId },
    include: { files: true },
  })
  if (!transfer) throw new AppError('Transfer not found', 404)
  if (transfer.expiresAt < new Date()) throw new AppError('Transfer has expired', 410)
  if (transfer.maxDownloads && transfer.downloadCount >= transfer.maxDownloads) {
    throw new AppError('Download limit reached', 410)
  }
  if (transfer.passwordHash) {
    if (!password) throw new AppError('Password required', 401)
    const valid = await bcrypt.compare(password, transfer.passwordHash)
    if (!valid) throw new AppError('Invalid password', 401)
  }
  return transfer
}

// Get transfer info
router.get('/:shortId', async (req, res, next) => {
  try {
    const password = req.headers['x-transfer-password'] as string | undefined
    const transfer = await getTransferOrThrow(req.params.shortId, password)

    res.json({
      shortId: transfer.shortId,
      title: transfer.title,
      message: transfer.message,
      expiresAt: transfer.expiresAt,
      downloadCount: transfer.downloadCount,
      maxDownloads: transfer.maxDownloads,
      totalSize: transfer.totalSize.toString(),
      passwordProtected: !!transfer.passwordHash,
      encrypted: transfer.encrypted,
      virusScanned: transfer.virusScanned,
      files: transfer.files.map((f) => ({
        id: f.id,
        name: f.name,
        relativePath: f.relativePath,
        size: f.size.toString(),
        mimeType: f.mimeType,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// Download all files as ZIP
router.get('/:shortId/zip', async (req, res, next) => {
  try {
    const password = req.headers['x-transfer-password'] as string | undefined
    const transfer = await getTransferOrThrow(req.params.shortId, password)

    const zipName = (transfer.title || `transfer-${transfer.shortId}`)
      .replace(/[^a-z0-9-_]/gi, '_')
      .slice(0, 50)

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}.zip"`)

    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', (err) => next(err))
    archive.pipe(res)

    for (const file of transfer.files) {
      const stream = await getObjectStream(file.storageKey)
      archive.append(stream as Readable, { name: file.relativePath || file.name })
    }

    await archive.finalize()

    await prisma.transfer.update({
      where: { id: transfer.id },
      data: { downloadCount: { increment: 1 } },
    })

    await prisma.downloadLog.create({
      data: {
        transferId: transfer.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    })

    await log('info', 'download', `ZIP downloaded: ${transfer.shortId}`, { ip: req.ip })

    if (transfer.notifyEmail) {
      // transfer.title is ciphertext when encrypted — the server can't read it, so don't leak it into the email
      sendDownloadNotification(transfer.notifyEmail, transfer.shortId, transfer.encrypted ? null : transfer.title).catch(
        console.error
      )
    }
  } catch (err) {
    next(err)
  }
})

// Download single file — streamed through backend so the public domain is used (reverse proxy friendly)
router.get('/:shortId/files/:fileId', async (req, res, next) => {
  try {
    const password = req.headers['x-transfer-password'] as string | undefined
    const transfer = await getTransferOrThrow(req.params.shortId, password)

    const file = transfer.files.find((f) => f.id === req.params.fileId)
    if (!file) throw new AppError('File not found', 404)

    const stream = await getObjectStream(file.storageKey)
    const contentLength = transfer.encrypted
      ? encryptedFileSize(Number(file.size))
      : Number(file.size)
    // file.name is ciphertext when encrypted — the frontend decrypts it client-side and
    // ignores this header for that flow; fall back to a neutral name for direct/curl access.
    const dispositionName = transfer.encrypted ? `encrypted-${file.id}.bin` : file.name
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(dispositionName)}"`)
    res.setHeader('Content-Length', String(contentLength))

    incrementDownloads()
    let counted = false
    const done = () => { if (!counted) { counted = true; decrementDownloads() } }
    res.on('finish', done)
    res.on('close', done)

    stream.pipe(res)

    await prisma.transfer.update({
      where: { id: transfer.id },
      data: { downloadCount: { increment: 1 } },
    })

    await prisma.downloadLog.create({
      data: { transferId: transfer.id, ip: req.ip, userAgent: req.headers['user-agent'] },
    })

    await log('info', 'download', `File downloaded: ${transfer.shortId}`, { ip: req.ip })

    if (transfer.notifyEmail) {
      sendDownloadNotification(transfer.notifyEmail, transfer.shortId, transfer.encrypted ? null : transfer.title).catch(console.error)
    }
  } catch (err) {
    next(err)
  }
})

export { router as downloadRouter }
