import { Router, Request } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import archiver from 'archiver'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { prisma } from '../lib/prisma'
import { getObjectStream } from '../lib/minio'
import { AppError } from '../middleware/errorHandler'
import { config } from '../config'
import { sendDownloadNotification } from '../services/email'
import { log, anonymizeIp } from '../services/logger'
import { incrementDownloads, decrementDownloads } from '../lib/liveCounters'
import { reserveDownload } from '../lib/downloads'
import { storedSize, safeArchivePath } from '../lib/uploadValidation'
import { rateLimiter } from '../lib/rateLimit'
import { z } from 'zod'

const router = Router()
router.use(rateLimiter('download', 100, 15 * 60_000))
async function getTransfer(req: Request, scope?: string) {
  const transfer = await prisma.transfer.findUnique({
    where: { shortId: req.params.shortId },
    include: { files: true },
  })
  if (!transfer) throw new AppError('Transfer not found', 404)
  if (transfer.expiresAt <= new Date())
    throw new AppError('Transfer expired', 410)
  if (
    transfer.maxDownloads !== null &&
    transfer.downloadCount >= transfer.maxDownloads
  )
    throw new AppError('Download limit reached', 410)
  let ticketValid = false
  if (scope && typeof req.query.ticket === 'string') {
    try {
      const data = jwt.verify(req.query.ticket, config.jwtSecret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload
      ticketValid =
        data.kind === 'download' &&
        data.shortId === transfer.shortId &&
        data.scope === scope
    } catch {}
    if (!ticketValid)
      throw new AppError('Invalid or expired download ticket', 401)
  }
  if (transfer.passwordHash && !ticketValid) {
    const password = req.get('x-transfer-password')
    if (
      !password ||
      password.length > 256 ||
      !(await bcrypt.compare(password, transfer.passwordHash))
    )
      throw new AppError('Password required or invalid', 401)
  }
  return transfer
}
router.post('/:shortId/ticket', async (req, res, next) => {
  try {
    const { fileId } = z
      .object({ fileId: z.string().min(1).max(128).optional() })
      .strict()
      .parse(req.body)
    const t = await getTransfer(req)
    if (fileId && !t.files.some((f) => f.id === fileId))
      throw new AppError('File not found', 404)
    if (!fileId && t.encrypted)
      throw new AppError(
        'Encrypted transfers must be downloaded individually',
        400
      )
    const scope = fileId || 'zip'
    const ticket = jwt.sign(
      { kind: 'download', shortId: t.shortId, scope },
      config.jwtSecret,
      { algorithm: 'HS256', expiresIn: '60s' }
    )
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ticket, expiresIn: 60 })
  } catch (err) {
    next(err)
  }
})
router.get('/:shortId', async (req, res, next) => {
  try {
    const t = await getTransfer(req)
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      shortId: t.shortId,
      title: t.title,
      message: t.message,
      expiresAt: t.expiresAt,
      downloadCount: t.downloadCount,
      maxDownloads: t.maxDownloads,
      totalSize: t.totalSize.toString(),
      passwordProtected: !!t.passwordHash,
      encrypted: t.encrypted,
      virusScanned: t.virusScanned,
      encryptedManifest: t.encryptedManifest,
      encryptionVersion: t.encryptionVersion,
      encryptionContext: t.encryptionContext,
      files: t.files.map((f) => ({
        id: f.id,
        name: f.name,
        encryptionIndex: f.encryptionIndex,
        relativePath: f.relativePath,
        size: f.size.toString(),
        mimeType: f.mimeType,
      })),
    })
  } catch (err) {
    next(err)
  }
})
async function recordDownload(
  req: Request,
  t: {
    id: string
    shortId: string
    notifyEmail: string | null
    encrypted: boolean
    title: string | null
  }
) {
  await prisma.downloadLog.create({
    data: {
      transferId: t.id,
      ip: req.ip ? anonymizeIp(req.ip) : null,
      userAgent: req.get('user-agent')?.slice(0, 512),
    },
  })
  await log('info', 'download', `Download started: ${t.shortId}`, {
    ip: req.ip,
  })
  if (t.notifyEmail)
    void sendDownloadNotification(
      t.notifyEmail,
      t.shortId,
      t.encrypted ? null : t.title
    ).catch(() => {})
}
router.get('/:shortId/zip', async (req, res, next) => {
  try {
    const t = await getTransfer(req, 'zip')
    if (t.encrypted)
      throw new AppError(
        'Encrypted transfers must be downloaded individually',
        400
      )
    const names = t.files.map((f) => safeArchivePath(f.relativePath || f.name))
    const archive = archiver('zip', { zlib: { level: 6 } })
    const streams: Readable[] = []
    try {
      for (const f of t.files) streams.push(await getObjectStream(f.storageKey))
      await reserveDownload(t.id)
    } catch (err) {
      for (const s of streams) s.destroy()
      archive.abort()
      throw err
    }
    const name = (t.title || `transfer-${t.shortId}`)
      .replace(/[^a-z0-9-_]/gi, '_')
      .slice(0, 50)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`)
    res.on('close', () => {
      for (const s of streams) s.destroy()
      archive.abort()
    })
    streams.forEach((s, i) => archive.append(s, { name: names[i] }))
    incrementDownloads()
    try {
      await Promise.all([
        pipeline(archive, res),
        archive.finalize(),
        recordDownload(req, t),
      ])
    } finally {
      decrementDownloads()
    }
  } catch (err) {
    if (res.headersSent) res.destroy(err as Error)
    else next(err)
  }
})
router.get('/:shortId/files/:fileId', async (req, res, next) => {
  try {
    const t = await getTransfer(req, req.params.fileId)
    const f = t.files.find((f) => f.id === req.params.fileId)
    if (!f) throw new AppError('File not found', 404)
    const stream = await getObjectStream(f.storageKey)
    try {
      await reserveDownload(t.id)
    } catch (err) {
      stream.destroy()
      throw err
    }
    const length =
      f.storedSize ?? BigInt(storedSize(Number(f.size), t.encrypted))
    const name = t.encrypted ? `encrypted-${f.id}.bin` : f.name
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`
    )
    res.setHeader('Content-Length', length.toString())
    incrementDownloads()
    try {
      await Promise.all([pipeline(stream, res), recordDownload(req, t)])
    } finally {
      decrementDownloads()
    }
  } catch (err) {
    if (res.headersSent) res.destroy(err as Error)
    else next(err)
  }
})
export { router as downloadRouter }
