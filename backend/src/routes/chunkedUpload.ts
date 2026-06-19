import express, { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma'
import {
  initiateMultipartUpload,
  uploadFilePart,
  completeFileParts,
  abortMultipartUpload,
} from '../lib/minio'
import { optionalAuth } from '../middleware/auth'
import { getSettings } from './settings'
import { log } from '../services/logger'
import { uploadSessions } from '../lib/uploadSessions'
import type { FileSession } from '../lib/uploadSessions'
import { createScanSession, runTransferScan } from '../services/virusScan'
import rateLimit from 'express-rate-limit'

const router = Router()

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
})

// ─── Phase 1: Init ───────────────────────────────────────────────────────────
// POST /api/transfers/chunked/init
// Body: { title?, message?, password?, expiresInDays?, notifyEmail?,
//         files: [{ name, size, mimeType }] }
// Response: { shortId, fileTokens: string[] }
router.post('/init', uploadLimiter, optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getSettings()
    const maxFileSizeBytes    = parseInt(settings['storage.maxFileSizeBytes'])
    const maxTransferSizeBytes = parseInt(settings['storage.maxTransferSizeBytes'])
    const maxFiles            = parseInt(settings['app.maxFilesPerTransfer'])
    const userId              = req.user?.id ?? null

    const retentionDays = userId
      ? parseInt(settings['storage.retentionDaysRegistered'])
      : parseInt(settings['storage.retentionDaysAnonymous'])

    const { title, message, password, expiresInDays, notifyEmail, files, encrypted } = req.body

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' })
    }
    if (files.length > maxFiles) {
      return res.status(400).json({ error: `Too many files (max ${maxFiles})` })
    }
    for (const f of files) {
      if (!f.name || typeof f.size !== 'number') {
        return res.status(400).json({ error: 'Invalid file metadata' })
      }
      if (f.size > maxFileSizeBytes) {
        return res.status(413).json({ error: `File "${f.name}" exceeds max size` })
      }
    }

    const shortId = nanoid(10)
    const passwordHash = password ? await bcrypt.hash(String(password), 12) : null

    const days = expiresInDays
      ? Math.min(parseInt(expiresInDays), retentionDays)
      : retentionDays
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + days)

    // Initiate a MinIO multipart upload for every file
    const fileTokens: string[] = []
    const fileSessions: [string, FileSession][] = []

    for (const file of files) {
      const token      = nanoid(16)
      const storageKey = `transfers/${shortId}/${nanoid(8)}/${file.name}`
      const uploadId   = await initiateMultipartUpload(
        storageKey,
        file.mimeType || 'application/octet-stream',
      )
      fileTokens.push(token)
      fileSessions.push([token, {
        uploadId,
        storageKey,
        filename:     file.name,
        mimeType:     file.mimeType || 'application/octet-stream',
        declaredSize: file.size,
        parts:        [],
      }])
    }

    uploadSessions.set(shortId, {
      shortId,
      userId,
      files:                new Map(fileSessions),
      meta:                 { title, message, passwordHash, expiresAt, notifyEmail },
      maxTransferSizeBytes,
      encrypted:            !!encrypted,
      createdAt:            new Date(),
    })

    res.json({ shortId, fileTokens })
  } catch (err) {
    next(err)
  }
})

// ─── Phase 2: Upload a chunk ─────────────────────────────────────────────────
// PUT /api/transfers/chunked/:shortId/part
// Headers: x-file-token, x-part-number
// Body: raw binary (application/octet-stream)
router.put(
  '/:shortId/part',
  express.raw({ type: 'application/octet-stream', limit: '20mb' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { shortId }  = req.params
      const fileToken    = req.headers['x-file-token'] as string
      const partNumber   = parseInt(req.headers['x-part-number'] as string)

      if (!fileToken || isNaN(partNumber) || partNumber < 1) {
        return res.status(400).json({ error: 'Missing x-file-token or x-part-number' })
      }

      const session = uploadSessions.get(shortId)
      if (!session) return res.status(404).json({ error: 'Upload session not found or expired' })

      const fileSession = session.files.get(fileToken)
      if (!fileSession) return res.status(404).json({ error: 'File token not found' })

      const chunk = req.body as Buffer
      if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
        return res.status(400).json({ error: 'Empty chunk body' })
      }

      const result = await uploadFilePart(
        fileSession.storageKey,
        fileSession.uploadId,
        partNumber,
        chunk,
      )

      fileSession.parts.push({ part: result.part, etag: result.etag })
      res.json({ part: result.part, etag: result.etag })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Phase 3: Finalize ───────────────────────────────────────────────────────
// POST /api/transfers/chunked/:shortId/finalize
router.post('/:shortId/finalize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shortId } = req.params
    const session = uploadSessions.get(shortId)
    if (!session) return res.status(404).json({ error: 'Upload session not found or expired' })

    let totalSize = 0
    const uploadedFiles: { name: string; size: number; mimeType: string; storageKey: string }[] = []

    // Complete every multipart upload
    for (const [, fs] of session.files) {
      if (fs.parts.length === 0) {
        return res.status(400).json({ error: `No parts received for file "${fs.filename}"` })
      }
      await completeFileParts(fs.storageKey, fs.uploadId, fs.parts)
      totalSize += fs.declaredSize
      uploadedFiles.push({
        name:       fs.filename,
        size:       fs.declaredSize,
        mimeType:   fs.mimeType,
        storageKey: fs.storageKey,
      })
    }

    if (totalSize > session.maxTransferSizeBytes) {
      // Abort all MinIO objects to avoid orphans
      for (const [, fs] of session.files) {
        await abortMultipartUpload(fs.storageKey, fs.uploadId).catch(() => {})
      }
      uploadSessions.delete(shortId)
      return res.status(413).json({ error: 'Transfer size exceeds limit' })
    }

    // E2E-encrypted transfers can't be scanned (the server never has the key),
    // so they skip straight to publishing — same as when the admin disabled scanning.
    const settings = await getSettings()
    const scanEnabled = settings['security.virusScanEnabled'] !== 'false'

    if (session.encrypted || !scanEnabled) {
      const transfer = await prisma.transfer.create({
        data: {
          shortId:      session.shortId,
          userId:       session.userId,
          title:        session.meta.title,
          message:      session.meta.message,
          passwordHash: session.meta.passwordHash,
          expiresAt:    session.meta.expiresAt,
          notifyEmail:  session.meta.notifyEmail,
          totalSize:    BigInt(totalSize),
          encrypted:    session.encrypted,
          virusScanned: false,
          files: {
            create: uploadedFiles.map((f) => ({
              name:       f.name,
              size:       BigInt(f.size),
              mimeType:   f.mimeType,
              storageKey: f.storageKey,
            })),
          },
        },
        include: { files: true },
      })

      if (session.userId) {
        await prisma.user.update({
          where: { id: session.userId },
          data:  { storageUsed: { increment: BigInt(totalSize) } },
        })
      }

      uploadSessions.delete(shortId)

      await log('info', 'upload',
        `Chunked transfer: ${transfer.shortId} — ${transfer.files.length} file(s), ` +
        `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
        { userId: session.userId ?? undefined, ip: req.ip },
      )

      return res.status(201).json({
        shortId:      transfer.shortId,
        expiresAt:    transfer.expiresAt,
        fileCount:    transfer.files.length,
        totalSize:    totalSize.toString(),
        virusScanned: false,
      })
    }

    const scanId = nanoid(20)
    createScanSession(scanId, {
      shortId:      session.shortId,
      userId:       session.userId,
      title:        session.meta.title,
      message:      session.meta.message,
      passwordHash: session.meta.passwordHash,
      expiresAt:    session.meta.expiresAt,
      notifyEmail:  session.meta.notifyEmail,
      totalSize,
      files:        uploadedFiles,
    })
    uploadSessions.delete(shortId)
    runTransferScan(scanId, req.ip)

    return res.status(202).json({ scanId })
  } catch (err) {
    next(err)
  }
})

// ─── Abort (cleanup on client error) ─────────────────────────────────────────
// DELETE /api/transfers/chunked/:shortId
router.delete('/:shortId', async (req: Request, res: Response) => {
  const session = uploadSessions.get(req.params.shortId)
  if (session) {
    for (const [, fs] of session.files) {
      await abortMultipartUpload(fs.storageKey, fs.uploadId).catch(() => {})
    }
    uploadSessions.delete(req.params.shortId)
  }
  res.json({ ok: true })
})

export { router as chunkedUploadRouter }
