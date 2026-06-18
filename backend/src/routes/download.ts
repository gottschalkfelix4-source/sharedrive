import { Router } from 'express'
import bcrypt from 'bcryptjs'
import archiver from 'archiver'
import { Readable } from 'stream'
import { prisma } from '../lib/prisma'
import { getObjectStream } from '../lib/minio'
import { AppError } from '../middleware/errorHandler'
import { sendDownloadNotification } from '../services/email'
import { log } from '../services/logger'

const router = Router()

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
      files: transfer.files.map((f) => ({
        id: f.id,
        name: f.name,
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
      archive.append(stream as Readable, { name: file.name })
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
      sendDownloadNotification(transfer.notifyEmail, transfer.shortId, transfer.title).catch(
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
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`)
    res.setHeader('Content-Length', file.size.toString())
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
      sendDownloadNotification(transfer.notifyEmail, transfer.shortId, transfer.title).catch(console.error)
    }
  } catch (err) {
    next(err)
  }
})

export { router as downloadRouter }
