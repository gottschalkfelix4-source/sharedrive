import express, { Router } from 'express'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma'
import {
  initiateMultipartUpload,
  uploadFilePart,
  completeFileParts,
  abortMultipartUpload,
  statStoredObject,
  uploadStream,
} from '../lib/minio'
import { Readable } from 'stream'
import { optionalAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { getSettings } from './settings'
import { uploadSessions, TransferSession } from '../lib/uploadSessions'
import { withJob } from '../lib/jobs'
import { reserveQuota, releaseQuota } from '../lib/quota'
import {
  uploadSchema,
  validateLimits,
  expectedPartSize,
  storedSize,
  CHUNK_SIZE,
} from '../lib/uploadValidation'
import { createScanSession, publishTransfer } from '../services/virusScan'
import { rateLimiter } from '../lib/rateLimit'
import { enqueueDeletion } from '../services/cleanup'

import { notifyPublished } from '../services/published'
import { anonymizeIp } from '../services/logger'

const router = Router()
router.post(
  '/init',
  rateLimiter('upload-init', 10, 60_000),
  optionalAuth,
  async (req, res, next) => {
    const opened: { key: string; uploadId: string }[] = []
    try {
      const input = uploadSchema.parse(req.body)
      const settings = await getSettings()
      const totalSize = validateLimits(input.files, settings)
      const shortId = nanoid(20)
      const session: TransferSession = {
        shortId,
        userId: req.user?.id ?? null,
        totalSize,
        files: {},
        state: 'uploading',
        encrypted: input.encrypted,
        encryptedManifest: input.encryptedManifest,
        encryptionVersion: input.encryptionVersion,
        encryptionContext: input.encryptionContext,
        maxTransferSizeBytes: Number(settings['storage.maxTransferSizeBytes']),
        createdAt: new Date().toISOString(),
        meta: {
          title: input.title,
          message: input.message,
          notifyEmail: input.notifyEmail,
          maxDownloads: input.maxDownloads,
          passwordHash: input.password
            ? await bcrypt.hash(input.password, 12)
            : null,
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
          ).toISOString(),
        },
      }
      for (const [fileIndex, file] of input.files.entries()) {
        expectedPartSize(file.size, input.encrypted, 1)
        const token = nanoid(32),
          storageKey = `transfers/${shortId}/${nanoid(24)}`
        // Zero-length plain objects are valid S3 objects but cannot form multipart uploads.
        const uploadId =
          file.size === 0 && !input.encrypted
            ? ''
            : await initiateMultipartUpload(storageKey, file.mimeType)
        if (uploadId) opened.push({ key: storageKey, uploadId })
        session.files[token] = {
          uploadId,
          storageKey,
          filename: file.name,
          fileIndex,
          relativePath: file.relativePath,
          mimeType: file.mimeType,
          declaredSize: file.size,
          parts: [],
        }
      }
      await prisma.$transaction(async (tx) => {
        await reserveQuota(
          tx,
          session.userId,
          totalSize,
          Number(settings['storage.userStorageQuotaBytes'])
        )
        await uploadSessions.set(shortId, session, tx)
      })
      res.status(201).json({ shortId, fileTokens: Object.keys(session.files) })
    } catch (err) {
      const cleanup = await Promise.allSettled(
        opened.map((f) => abortMultipartUpload(f.key, f.uploadId))
      )
      const deferred = opened.filter((_, i) => cleanup[i].status === 'rejected')
      if (deferred.length)
        await enqueueDeletion(deferred).catch(() =>
          console.error('Untracked multipart cleanup failed')
        )
      next(err)
    }
  }
)
router.put(
  '/:shortId/part',
  rateLimiter('upload-part', 1200, 60_000),
  express.raw({ type: 'application/octet-stream', limit: CHUNK_SIZE + 28 }),
  async (req, res, next) => {
    try {
      const result = await withJob(req.params.shortId, async (tx) => {
        const s = await uploadSessions.get(req.params.shortId, tx)
        if (!s || s.state !== 'uploading')
          throw new AppError('Upload not available', 404)
        const f = s.files[req.get('x-file-token') || '']
        if (!f) throw new AppError('Invalid file token', 403)
        const text = req.get('x-part-number') || ''
        if (!/^\d+$/.test(text)) throw new AppError('Invalid part number', 400)
        const part = Number(text),
          expected = expectedPartSize(f.declaredSize, s.encrypted, part)
        const chunk =
          expected === 0 && !Buffer.isBuffer(req.body)
            ? Buffer.alloc(0)
            : (req.body as Buffer)
        if (!Buffer.isBuffer(chunk) || chunk.length !== expected)
          throw new AppError('Chunk size does not match declared size', 413)
        if (expected === 0) {
          f.parts = [{ part: 1, etag: 'empty', bytes: 0 }]
          await uploadSessions.set(s.shortId, s, tx)
          return { part: 1, etag: 'empty' }
        }
        const uploaded = await uploadFilePart(
          f.storageKey,
          f.uploadId,
          part,
          chunk
        )
        f.parts = f.parts.filter((p) => p.part !== part)
        f.parts.push({ ...uploaded, bytes: chunk.length })
        await uploadSessions.set(s.shortId, s, tx)
        return uploaded
      })
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)
router.post('/:shortId/finalize', async (req, res, next) => {
  try {
    const result = await withJob(req.params.shortId, async (tx) => {
      const s = await uploadSessions.get(req.params.shortId, tx)
      if (!s) throw new AppError('Upload not found', 404)
      if (!s.files[req.get('x-file-token') || ''])
        throw new AppError('Invalid file token', 403)
      if (s.result) return { ...s.result, notify: false }
      const files = Object.values(s.files)
      for (const f of files) {
        const count = Math.max(1, Math.ceil(f.declaredSize / CHUNK_SIZE))
        if (
          f.parts.length !== count ||
          f.parts.reduce((n, p) => n + p.bytes, 0) !==
            storedSize(f.declaredSize, s.encrypted)
        )
          throw new AppError('Upload incomplete', 400)
      }
      s.state = 'finalizing'
      // Object stat recovers completion after a crash between storage and DB commits.
      for (const f of files) {
        if (f.completed) continue
        let existing: number | undefined
        try {
          existing = await statStoredObject(f.storageKey)
        } catch (err) {
          if (
            !['NoSuchKey', 'NotFound'].includes((err as { code: string }).code)
          )
            throw err
        }
        if (existing !== undefined) {
          if (existing !== storedSize(f.declaredSize, s.encrypted))
            throw new AppError('Stored object size mismatch', 400)
          f.completed = true
          continue
        }
        if (!f.uploadId)
          await uploadStream(f.storageKey, Readable.from([]), f.mimeType)
        else await completeFileParts(f.storageKey, f.uploadId, f.parts)
        if (
          (await statStoredObject(f.storageKey)) !==
          storedSize(f.declaredSize, s.encrypted)
        )
          throw new AppError('Stored object size mismatch', 400)
        f.completed = true
      }
      const pending = {
        ip: anonymizeIp(req.ip || ''),
        shortId: s.shortId,
        userId: s.userId,
        ...s.meta,
        expiresAt: new Date(s.meta.expiresAt),
        totalSize: s.totalSize,
        encrypted: s.encrypted,
        encryptedManifest: s.encryptedManifest,
        encryptionVersion: s.encryptionVersion,
        encryptionContext: s.encryptionContext,
        files: files.map((f) => ({
          name: f.filename,
          encryptionIndex: f.fileIndex,
          relativePath: f.relativePath,
          size: f.declaredSize,
          storedSize: storedSize(f.declaredSize, s.encrypted),
          mimeType: f.mimeType,
          storageKey: f.storageKey,
        })),
      }
      const settings = await getSettings()
      if (s.encrypted || settings['security.virusScanEnabled'] === 'false') {
        const transfer = await publishTransfer(pending, false, tx)
        s.state = 'published'
        s.result = {
          status: 201,
          body: { ...transfer, expiresAt: transfer.expiresAt.toISOString() },
        }
        await uploadSessions.set(s.shortId, s, tx)
        await tx.job.update({
          where: { id: s.shortId },
          data: { status: 'done' },
        })
        return { ...s.result, notify: true }
      }
      const scanId = nanoid(32)
      await createScanSession(scanId, pending, tx)
      s.state = 'published'
      s.result = { status: 202, body: { scanId } }
      await uploadSessions.set(s.shortId, s, tx)
      await tx.job.update({
        where: { id: s.shortId },
        data: { status: 'done' },
      })
      return { ...s.result, notify: false }
    })
    if (result.notify && result.status === 201 && 'shortId' in result.body)
      void notifyPublished(result.body.shortId, req.ip).catch(() =>
        console.error('Upload notification deferred')
      )
    res.status(result.status).json(result.body)
  } catch (err) {
    next(err)
  }
})
router.delete('/:shortId', async (req, res, next) => {
  try {
    await withJob(req.params.shortId, async (tx) => {
      const s = await uploadSessions.get(req.params.shortId, tx)
      if (!s) return
      // File tokens are capabilities; abort requires one, rather than just a public shortId.
      if (!s.files[req.get('x-file-token') || ''])
        throw new AppError('Invalid file token', 403)
      if (s.state === 'published') return
      await enqueueDeletion(
        Object.values(s.files).map((f) => ({
          key: f.storageKey,
          uploadId: f.completed ? undefined : f.uploadId || undefined,
        })),
        tx
      )
      await releaseQuota(tx, s.userId, s.totalSize)
      await uploadSessions.delete(s.shortId, tx)
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
export { router as chunkedUploadRouter }
