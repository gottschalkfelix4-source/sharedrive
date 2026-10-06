import { Router, Request } from 'express'
import { Transform } from 'stream'
import Busboy from 'busboy'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma'
import { uploadStream } from '../lib/minio'
import { requireAuth, optionalAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { getSettings } from './settings'
import { notifyPublished } from '../services/published'
import { sendUploadConfirmationEmail } from '../services/email'
import { log, anonymizeIp } from '../services/logger'
import { createScanSession, publishTransfer } from '../services/virusScan'
import { enqueueDeletion, deleteTransfer } from '../services/cleanup'
import {
  uploadSchema,
  validateLimits,
  safeArchivePath,
} from '../lib/uploadValidation'
import { reserveQuota } from '../lib/quota'
import { rateLimiter } from '../lib/rateLimit'
import geoip from 'geoip-lite'
import UAParser from 'ua-parser-js'

const router = Router()
const uploadLimiter = rateLimiter('classic-upload', 10, 60_000)
const writeLimiter = rateLimiter('transfer-write', 10, 60_000)

router.post('/', uploadLimiter, optionalAuth, async (req, res, next) => {
  const keys: string[] = []
  const tasks: Promise<void>[] = []
  let published = false
  try {
    const settings = await getSettings()
    const shortId = nanoid(20)
    const fields: Record<string, string> = {}
    const files: {
      name: string
      size: number
      mimeType: string
      storageKey: string
    }[] = []
    const trackers: Transform[] = []
    let total = 0
    await new Promise<void>((resolve, reject) => {
      let failed = false
      const bb = Busboy({
        headers: req.headers,
        limits: {
          fileSize: Number(settings['storage.maxFileSizeBytes']) + 1,
          files: Number(settings['app.maxFilesPerTransfer']),
          fields: 6,
          fieldSize: 8192,
          parts: Number(settings['app.maxFilesPerTransfer']) + 6,
        },
      })
      const fail = (err: Error) => {
        if (failed) return
        failed = true
        for (const t of trackers) t.destroy(err)
        req.unpipe(bb)
        queueMicrotask(() => bb.destroy())
        req.resume()
        reject(err)
      }
      req.once('aborted', () => fail(new AppError('Upload aborted', 400)))
      bb.on('field', (name, value, info) => {
        if (info.valueTruncated)
          return fail(new AppError('Field too large', 413))
        if (
          ![
            'title',
            'message',
            'password',
            'expiresInDays',
            'notifyEmail',
            'maxDownloads',
          ].includes(name)
        )
          return fail(new AppError('Unknown upload field', 400))
        fields[name] = value
      })
      bb.on('filesLimit', () => fail(new AppError('Too many files', 413)))
      bb.on('fieldsLimit', () => fail(new AppError('Too many fields', 413)))
      bb.on('partsLimit', () => fail(new AppError('Too many parts', 413)))
      bb.on('error', (err) => fail(err as Error))
      bb.on('file', (_name, stream, info) => {
        try {
          safeArchivePath(info.filename)
        } catch (err) {
          stream.resume()
          return fail(err as Error)
        }
        const storageKey = `transfers/${shortId}/${nanoid(24)}`
        keys.push(storageKey)
        let size = 0
        const tracker = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            size += chunk.length
            total += chunk.length
            if (size > Number(settings['storage.maxFileSizeBytes']))
              return callback(new AppError('File size exceeds limit', 413))
            if (total > Number(settings['storage.maxTransferSizeBytes']))
              return callback(new AppError('Transfer size exceeds limit', 413))
            callback(null, chunk)
          },
        })
        trackers.push(tracker)
        stream.on('limit', () =>
          fail(new AppError('File size exceeds limit', 413))
        )
        stream.on('error', (err) => tracker.destroy(err))
        tracker.on('error', (err) => fail(err))
        stream.pipe(tracker)
        tasks.push(
          uploadStream(storageKey, tracker, info.mimeType)
            .then(() => {
              files.push({
                name: info.filename,
                size,
                mimeType: info.mimeType,
                storageKey,
              })
            })
            .catch((err) => {
              fail(err)
              throw err
            })
        )
        // Observe failures immediately, even before the parser finishes.
        void tasks[tasks.length - 1].catch(() => {})
      })
      bb.on('close', () => {
        if (!failed) resolve()
      })
      req.pipe(bb)
    })
    await Promise.all(tasks)
    const input = uploadSchema.parse({ ...fields, files })
    validateLimits(files, settings)
    const pending = {
      ip: anonymizeIp(req.ip || ''),
      shortId,
      userId: req.user?.id ?? null,
      title: input.title,
      message: input.message,
      notifyEmail: input.notifyEmail,
      maxDownloads: input.maxDownloads,
      passwordHash: input.password
        ? await bcrypt.hash(input.password, 12)
        : null,
      totalSize: total,
      expiresAt: new Date(
        Date.now() +
          Math.min(
            input.expiresInDays ?? 7,
            Number(
              settings[
                req.user
                  ? 'storage.retentionDaysRegistered'
                  : 'storage.retentionDaysAnonymous'
              ]
            )
          ) *
            86400000
      ),
      files,
    }
    const result = await prisma.$transaction(async (tx) => {
      await reserveQuota(
        tx,
        pending.userId,
        total,
        Number(settings['storage.userStorageQuotaBytes'])
      )
      if (settings['security.virusScanEnabled'] === 'false')
        return { status: 201, body: await publishTransfer(pending, false, tx) }
      const scanId = nanoid(32)
      await createScanSession(scanId, pending, tx)
      return { status: 202, body: { scanId } }
    })
    published = true
    if (result.status === 201)
      void notifyPublished(shortId, req.ip).catch(() =>
        console.error('Upload notification failed')
      )
    res.status(result.status).json(result.body)
  } catch (err) {
    await Promise.allSettled(tasks)
    if (!published)
      await enqueueDeletion(keys.map((key) => ({ key }))).catch(() =>
        console.error('Failed to enqueue upload cleanup')
      )
    next(err)
  }
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
        include: {
          files: {
            select: {
              id: true,
              name: true,
              relativePath: true,
              size: true,
              mimeType: true,
            },
          },
        },
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
        files: t.files.map((f) => ({
          id: f.id,
          name: f.name,
          relativePath: f.relativePath,
          size: f.size.toString(),
          mimeType: f.mimeType,
        })),
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
    const transfer = await prisma.transfer.findUnique({
      where: { shortId: req.params.shortId },
    })
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
      const maxRetentionDays = parseInt(
        settings['storage.retentionDaysRegistered']
      )
      const maxDate = new Date()
      maxDate.setDate(maxDate.getDate() + maxRetentionDays)
      if (date > maxDate) {
        throw new AppError(
          `expiresAt cannot be more than ${maxRetentionDays} days from now`,
          400
        )
      }
      data.expiresAt = date
    }

    if (maxDownloads !== undefined) {
      if (maxDownloads === null) {
        data.maxDownloads = null
      } else {
        const parsed = parseInt(maxDownloads)
        if (
          !Number.isFinite(parsed) ||
          parsed < transfer.downloadCount ||
          parsed > 100000
        ) {
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
      include: {
        files: {
          select: {
            id: true,
            name: true,
            relativePath: true,
            size: true,
            mimeType: true,
          },
        },
      },
    })

    await log('info', 'upload', `Transfer updated: ${updated.shortId}`, {
      userId: req.user!.id,
      ip: req.ip,
    })

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
      files: updated.files.map((f) => ({
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

router.post(
  '/:shortId/resend',
  writeLimiter,
  requireAuth,
  async (req, res, next) => {
    try {
      const transfer = await prisma.transfer.findUnique({
        where: { shortId: req.params.shortId },
      })
      if (!transfer) throw new AppError('Transfer not found', 404)
      if (transfer.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
        throw new AppError('Not authorized', 403)
      }
      if (transfer.expiresAt < new Date()) {
        throw new AppError('Transfer has expired', 410)
      }

      const { email } = req.body
      if (
        !email ||
        typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        throw new AppError('Invalid email address', 400)
      }

      // transfer.title is ciphertext when encrypted — the server can't read it, so don't leak it into the resent email
      await sendUploadConfirmationEmail(
        email,
        transfer.shortId,
        transfer.encrypted ? null : transfer.title,
        transfer.expiresAt
      )
      await log('info', 'upload', `Transfer link resent: ${transfer.shortId}`, {
        userId: req.user!.id,
        ip: req.ip,
      })

      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

router.get('/:shortId/downloads', requireAuth, async (req, res, next) => {
  try {
    const transfer = await prisma.transfer.findUnique({
      where: { shortId: req.params.shortId },
    })
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
        const ua = entry.userAgent
          ? new UAParser(entry.userAgent).getResult()
          : null
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

    await deleteTransfer(transfer.id)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export { router as transfersRouter }
