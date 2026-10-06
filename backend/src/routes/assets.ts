import { Router } from 'express'
import Busboy from 'busboy'
import { pipeline } from 'stream/promises'
import { requireAdmin } from '../middleware/auth'
import { minioClient } from '../lib/minio'
import { prisma } from '../lib/prisma'
import { config } from '../config'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/x-icon',
]
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB
const ASSET_KEYS: Record<string, string> = {
  logo: '_assets/logo',
  favicon: '_assets/favicon',
}
const SETTING_KEYS: Record<string, string> = {
  logo: 'appearance.logoUrl',
  favicon: 'appearance.faviconUrl',
}

// POST /api/assets/upload?type=logo|favicon  (admin only)
router.post('/upload', requireAdmin, async (req, res, next) => {
  try {
    const type = req.query.type as string
    if (!ASSET_KEYS[type])
      throw new AppError('Invalid type — use logo or favicon', 400)

    const { buffer, mimeType } = await new Promise<{
      buffer: Buffer
      mimeType: string
    }>((resolve, reject) => {
      const bb = Busboy({
        headers: req.headers,
        limits: { files: 1, fields: 0, parts: 1, fileSize: MAX_SIZE_BYTES + 1 },
      })
      let file: { buffer: Buffer; mimeType: string } | undefined,
        failed = false
      const fail = (err: Error) => {
        if (failed) return
        failed = true
        req.unpipe(bb)
        queueMicrotask(() => bb.destroy())
        req.resume()
        reject(err)
      }
      req.once('aborted', () => fail(new AppError('Upload aborted', 400)))
      bb.on('error', (err) => fail(err as Error))
      bb.on('filesLimit', () =>
        fail(new AppError('Only one image allowed', 413))
      )
      bb.on('fieldsLimit', () =>
        fail(new AppError('Unexpected image field', 400))
      )
      bb.on('partsLimit', () =>
        fail(new AppError('Only one image allowed', 413))
      )
      bb.on('file', (_field, stream, info) => {
        if (!ALLOWED_TYPES.includes(info.mimeType)) {
          stream.resume()
          fail(new AppError('Invalid image type', 400))
          return
        }
        const chunks: Buffer[] = []
        let bytes = 0
        stream.on('data', (c) => {
          bytes += c.length
          if (bytes > MAX_SIZE_BYTES)
            fail(new AppError('File too large (max 2 MB)', 413))
          else chunks.push(c)
        })
        stream.on('error', (err) => fail(err as Error))
        stream.on('limit', () =>
          fail(new AppError('File too large (max 2 MB)', 413))
        )
        stream.on('end', () => {
          file = { buffer: Buffer.concat(chunks), mimeType: info.mimeType }
        })
      })
      bb.on('close', () => {
        if (!failed) {
          if (file) resolve(file)
          else reject(new AppError('No file received', 400))
        }
      })
      req.pipe(bb)
    })
    const signatures: Record<string, boolean> = {
      'image/png': buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/jpeg': buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255,
      'image/gif': /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString()),
      'image/webp':
        buffer.subarray(0, 4).toString() === 'RIFF' &&
        buffer.subarray(8, 12).toString() === 'WEBP',
      'image/x-icon': buffer.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])),
    }
    if (!signatures[mimeType]) throw new AppError('Invalid image content', 400)
    await minioClient.putObject(
      config.minio.bucket,
      ASSET_KEYS[type],
      buffer,
      buffer.length,
      { 'Content-Type': mimeType }
    )
    const url = `/api/assets/${type}`
    await prisma.setting.upsert({
      where: { key: SETTING_KEYS[type] },
      update: { value: url },
      create: { key: SETTING_KEYS[type], value: url },
    })
    res.json({ url })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/assets/:type  (admin only)
router.delete('/:type', requireAdmin, async (req, res, next) => {
  try {
    const { type } = req.params
    if (!ASSET_KEYS[type]) throw new AppError('Invalid type', 400)

    await minioClient.removeObject(config.minio.bucket, ASSET_KEYS[type])

    await prisma.setting.upsert({
      where: { key: SETTING_KEYS[type] },
      update: { value: '' },
      create: { key: SETTING_KEYS[type], value: '' },
    })

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/assets/:type  (public — no auth)
router.get('/:type', async (req, res, next) => {
  try {
    const { type } = req.params
    if (!ASSET_KEYS[type]) throw new AppError('Not found', 404)

    const key = ASSET_KEYS[type]
    const stat = await minioClient.statObject(config.minio.bucket, key)
    if (!ALLOWED_TYPES.includes(stat.metaData?.['content-type']))
      throw new AppError(
        'Unsupported legacy image format; upload a PNG, JPEG, GIF, WebP or ICO',
        400
      )
    const stream = await minioClient.getObject(config.minio.bucket, key)

    res.setHeader(
      'Content-Type',
      stat.metaData?.['content-type'] || 'application/octet-stream'
    )
    res.setHeader('Cache-Control', 'public, max-age=3600')
    await pipeline(stream, res)
  } catch (err: any) {
    if (err?.code === 'NoSuchKey' || err?.message?.includes('Not Found')) {
      res.status(404).end()
    } else {
      next(err)
    }
  }
})

export { router as assetsRouter }
