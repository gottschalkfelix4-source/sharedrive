import { Router } from 'express'
import Busboy from 'busboy'
import { requireAdmin } from '../middleware/auth'
import { minioClient } from '../lib/minio'
import { prisma } from '../lib/prisma'
import { config } from '../config'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon']
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
    if (!ASSET_KEYS[type]) throw new AppError('Invalid type — use logo or favicon', 400)

    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_SIZE_BYTES } })
    let uploaded = false

    bb.on('file', (_field, stream, info) => {
      const { mimeType } = info
      if (!ALLOWED_TYPES.includes(mimeType)) {
        stream.resume()
        return next(new AppError('Invalid file type — only images allowed', 400))
      }

      const chunks: Buffer[] = []
      let truncated = false

      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('limit', () => { truncated = true })
      stream.on('end', async () => {
        if (truncated) return next(new AppError('File too large (max 2 MB)', 413))

        const buffer = Buffer.concat(chunks)
        const key = ASSET_KEYS[type]

        try {
          await minioClient.putObject(config.minio.bucket, key, buffer, buffer.length, {
            'Content-Type': mimeType,
          })

          const url = `/api/assets/${type}`
          await prisma.setting.upsert({
            where: { key: SETTING_KEYS[type] },
            update: { value: url },
            create: { key: SETTING_KEYS[type], value: url },
          })

          uploaded = true
          res.json({ url })
        } catch (err) {
          next(err)
        }
      })
    })

    bb.on('finish', () => {
      if (!uploaded) next(new AppError('No file received', 400))
    })

    req.pipe(bb)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/assets/:type  (admin only)
router.delete('/:type', requireAdmin, async (req, res, next) => {
  try {
    const { type } = req.params
    if (!ASSET_KEYS[type]) throw new AppError('Invalid type', 400)

    try {
      await minioClient.removeObject(config.minio.bucket, ASSET_KEYS[type])
    } catch {
      // object might not exist — that's fine
    }

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
    const stream = await minioClient.getObject(config.minio.bucket, key)

    res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    stream.pipe(res)
  } catch (err: any) {
    if (err?.code === 'NoSuchKey' || err?.message?.includes('Not Found')) {
      res.status(404).end()
    } else {
      next(err)
    }
  }
})

export { router as assetsRouter }
