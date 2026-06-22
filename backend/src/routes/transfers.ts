import { Router, Request, Response } from 'express'
import { Transform } from 'stream'
import Busboy from 'busboy'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma'
import { uploadStream, deleteObjects } from '../lib/minio'
import { requireAuth, optionalAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { getSettings } from './settings'
import { log } from '../services/logger'
import { createScanSession, runTransferScan } from '../services/virusScan'
import { sendUploadConfirmationEmail } from '../services/email'
import geoip from 'geoip-lite'
import UAParser from 'ua-parser-js'
import rateLimit from 'express-rate-limit'

const router = Router()

const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })

router.post('/', uploadLimiter, optionalAuth, (req: Request, res: Response) => {
  getSettings().then((settings) => {
    const maxFileSize = parseInt(settings['storage.maxFileSizeBytes'])
    const maxTransferSize = parseInt(settings['storage.maxTransferSizeBytes'])
    const maxFiles = parseInt(settings['app.maxFilesPerTransfer'])

    const shortId = nanoid(10)
    const userId = req.user?.id ?? null

    const retentionDays = userId
      ? parseInt(settings['storage.retentionDaysRegistered'])
      : parseInt(settings['storage.retentionDaysAnonymous'])

    let title: string | undefined
    let message: string | undefined
    let password: string | undefined
    let expiresInDays: number | undefined
    let notifyEmail: string | undefined
    let maxDownloads: number | undefined

    const uploadedFiles: Array<{
      name: string
      size: number
      mimeType: string
      storageKey: string
    }> = []

    let totalSize = 0
    let fileCount = 0
    const filePromises: Promise<void>[] = []

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: maxFileSize },
    })

    busboy.on('field', (name: string, value: string) => {
      if (name === 'title') title = value.slice(0, 200)
      else if (name === 'message') message = value.slice(0, 1000)
      else if (name === 'password') password = value
      else if (name === 'expiresInDays') expiresInDays = Math.min(parseInt(value) || retentionDays, retentionDays)
      else if (name === 'notifyEmail') notifyEmail = value
      else if (name === 'maxDownloads') {
        const parsed = parseInt(value)
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100000) maxDownloads = parsed
      }
    })

    busboy.on('file', (_fieldname: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
      if (fileCount >= maxFiles) {
        stream.resume()
        return
      }
      fileCount++

      const storageKey = `transfers/${shortId}/${nanoid(8)}/${info.filename}`
      let fileSize = 0

      const sizeTracker = new Transform({
        transform(chunk: Buffer, _encoding: string, cb: () => void) {
          fileSize += chunk.length
          totalSize += chunk.length
          this.push(chunk)
          cb()
        },
      })

      const p = new Promise<void>((resolve, reject) => {
        stream.pipe(sizeTracker)
        sizeTracker.on('error', reject)

        uploadStream(storageKey, sizeTracker, info.mimeType || 'application/octet-stream')
          .then(() => {
            uploadedFiles.push({ name: info.filename, size: fileSize, mimeType: info.mimeType || 'application/octet-stream', storageKey })
            resolve()
          })
          .catch(reject)
      })

      filePromises.push(p)
    })

    busboy.on('close', async () => {
      try {
        if (filePromises.length === 0) {
          res.status(400).json({ error: 'No files provided' })
          return
        }

        await Promise.all(filePromises)

        if (totalSize > maxTransferSize) {
          await deleteObjects(uploadedFiles.map((f) => f.storageKey))
          res.status(413).json({ error: 'Transfer size exceeds limit' })
          return
        }

        const passwordHash = password ? await bcrypt.hash(password, 12) : null
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + (expiresInDays ?? retentionDays))

        const scanEnabled = settings['security.virusScanEnabled'] !== 'false'

        if (!scanEnabled) {
          const transfer = await prisma.transfer.create({
            data: {
              shortId,
              userId,
              title,
              message,
              passwordHash,
              expiresAt,
              notifyEmail,
              maxDownloads: maxDownloads ?? null,
              totalSize: BigInt(totalSize),
              files: {
                create: uploadedFiles.map((f) => ({
                  name: f.name,
                  size: BigInt(f.size),
                  mimeType: f.mimeType,
                  storageKey: f.storageKey,
                })),
              },
            },
            include: { files: true },
          })

          if (userId) {
            await prisma.user.update({
              where: { id: userId },
              data: { storageUsed: { increment: BigInt(totalSize) } },
            })
          }

          await log('info', 'upload', `Transfer uploaded: ${transfer.shortId} — ${transfer.files.length} file(s), ${(totalSize / 1024 / 1024).toFixed(1)} MB`, {
            userId: userId ?? undefined,
            ip: req.ip,
            fileCount: transfer.files.length,
            totalSizeBytes: totalSize,
          })

          if (transfer.notifyEmail) {
            // This route never sets encrypted=true, but guard anyway for consistency with the chunked path
            sendUploadConfirmationEmail(transfer.notifyEmail, transfer.shortId, transfer.encrypted ? null : transfer.title, transfer.expiresAt).catch(console.error)
          }

          res.status(201).json({
            shortId: transfer.shortId,
            expiresAt: transfer.expiresAt,
            fileCount: transfer.files.length,
            totalSize: totalSize.toString(),
            virusScanned: false,
          })
          return
        }

        const scanId = nanoid(20)
        createScanSession(scanId, {
          shortId,
          userId,
          title,
          message,
          passwordHash,
          expiresAt,
          notifyEmail,
          maxDownloads,
          totalSize,
          files: uploadedFiles,
        })
        runTransferScan(scanId, req.ip)

        res.status(202).json({ scanId })
      } catch (err) {
        await log('error', 'upload', `Upload failed: ${(err as Error).message}`, { ip: req.ip })
        console.error('Transfer creation error:', err)
        if (!res.headersSent) res.status(500).json({ error: 'Upload failed' })
      }
    })

    busboy.on('error', (err: Error) => {
      console.error('Busboy error:', err)
      if (!res.headersSent) res.status(500).json({ error: 'Upload processing failed' })
    })

    req.pipe(busboy)
  }).catch((err) => {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  })
})

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 20
    const skip = (page - 1) * limit

    const [transfers, total] = await Promise.all([
      prisma.transfer.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { files: { select: { id: true, name: true, relativePath: true, size: true, mimeType: true } } },
      }),
      prisma.transfer.count({ where: { userId: req.user!.id } }),
    ])

    res.json({
      transfers: transfers.map((t) => ({
        shortId: t.shortId,
        title: t.title,
        message: t.message,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
        downloadCount: t.downloadCount,
        maxDownloads: t.maxDownloads,
        notifyEmail: t.notifyEmail,
        totalSize: t.totalSize.toString(),
        passwordProtected: !!t.passwordHash,
        encrypted: t.encrypted,
        files: t.files.map((f) => ({ id: f.id, name: f.name, relativePath: f.relativePath, size: f.size.toString(), mimeType: f.mimeType })),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (err) {
    next(err)
  }
})

router.patch('/:shortId', writeLimiter, requireAuth, async (req, res, next) => {
  try {
    const transfer = await prisma.transfer.findUnique({ where: { shortId: req.params.shortId } })
    if (!transfer) throw new AppError('Transfer not found', 404)
    if (transfer.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403)
    }

    const { expiresAt, maxDownloads } = req.body
    const data: { expiresAt?: Date; maxDownloads?: number | null } = {}

    if (expiresAt !== undefined) {
      const date = new Date(expiresAt)
      if (isNaN(date.getTime()) || date <= new Date()) {
        throw new AppError('Invalid expiresAt date', 400)
      }
      const settings = await getSettings()
      const maxRetentionDays = parseInt(settings['storage.retentionDaysRegistered'])
      const maxDate = new Date()
      maxDate.setDate(maxDate.getDate() + maxRetentionDays)
      if (date > maxDate) {
        throw new AppError(`expiresAt cannot be more than ${maxRetentionDays} days from now`, 400)
      }
      data.expiresAt = date
    }

    if (maxDownloads !== undefined) {
      if (maxDownloads === null) {
        data.maxDownloads = null
      } else {
        const parsed = parseInt(maxDownloads)
        if (!Number.isFinite(parsed) || parsed < transfer.downloadCount || parsed > 100000) {
          throw new AppError('Invalid maxDownloads value', 400)
        }
        data.maxDownloads = parsed
      }
    }

    if (Object.keys(data).length === 0) {
      throw new AppError('No valid fields to update', 400)
    }

    const updated = await prisma.transfer.update({
      where: { id: transfer.id },
      data,
      include: { files: { select: { id: true, name: true, relativePath: true, size: true, mimeType: true } } },
    })

    await log('info', 'upload', `Transfer updated: ${updated.shortId}`, { userId: req.user!.id, ip: req.ip })

    res.json({
      shortId: updated.shortId,
      title: updated.title,
      message: updated.message,
      expiresAt: updated.expiresAt,
      createdAt: updated.createdAt,
      downloadCount: updated.downloadCount,
      maxDownloads: updated.maxDownloads,
      notifyEmail: updated.notifyEmail,
      totalSize: updated.totalSize.toString(),
      passwordProtected: !!updated.passwordHash,
      files: updated.files.map((f) => ({ id: f.id, name: f.name, relativePath: f.relativePath, size: f.size.toString(), mimeType: f.mimeType })),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/:shortId/resend', writeLimiter, requireAuth, async (req, res, next) => {
  try {
    const transfer = await prisma.transfer.findUnique({ where: { shortId: req.params.shortId } })
    if (!transfer) throw new AppError('Transfer not found', 404)
    if (transfer.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403)
    }
    if (transfer.expiresAt < new Date()) {
      throw new AppError('Transfer has expired', 410)
    }

    const { email } = req.body
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('Invalid email address', 400)
    }

    // transfer.title is ciphertext when encrypted — the server can't read it, so don't leak it into the resent email
    await sendUploadConfirmationEmail(email, transfer.shortId, transfer.encrypted ? null : transfer.title, transfer.expiresAt)
    await log('info', 'upload', `Transfer link resent: ${transfer.shortId}`, { userId: req.user!.id, ip: req.ip })

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

router.get('/:shortId/downloads', requireAuth, async (req, res, next) => {
  try {
    const transfer = await prisma.transfer.findUnique({ where: { shortId: req.params.shortId } })
    if (!transfer) throw new AppError('Transfer not found', 404)
    if (transfer.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403)
    }

    const logs = await prisma.downloadLog.findMany({
      where: { transferId: transfer.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    res.json({
      downloads: logs.map((entry) => {
        const ip = entry.ip?.replace(/^::ffff:/, '')
        const geo = ip ? geoip.lookup(ip) : null
        const ua = entry.userAgent ? new UAParser(entry.userAgent).getResult() : null
        return {
          id: entry.id,
          createdAt: entry.createdAt,
          country: geo?.country ?? null,
          browser: ua?.browser.name ?? null,
          os: ua?.os.name ?? null,
        }
      }),
    })
  } catch (err) {
    next(err)
  }
})

router.delete('/:shortId', requireAuth, async (req, res, next) => {
  try {
    const transfer = await prisma.transfer.findUnique({
      where: { shortId: req.params.shortId },
      include: { files: true },
    })
    if (!transfer) throw new AppError('Transfer not found', 404)
    if (transfer.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403)
    }

    await deleteObjects(transfer.files.map((f) => f.storageKey))

    if (transfer.userId) {
      await prisma.user.update({
        where: { id: transfer.userId },
        data: { storageUsed: { decrement: transfer.totalSize } },
      })
    }

    await prisma.transfer.delete({ where: { id: transfer.id } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export { router as transfersRouter }
