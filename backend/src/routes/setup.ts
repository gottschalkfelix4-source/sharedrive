import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { withJob } from '../lib/jobs'
import { AppError } from '../middleware/errorHandler'
import { passwordSchema } from '../lib/validation'
import { requireSetupToken } from '../lib/bootstrap'
import { rateLimiter } from '../lib/rateLimit'
import { ensureBucket } from '../lib/minio'

const router = Router()

// An interrupted rotation from an older release still needs its saved environment.
const credentialFingerprint = () =>
  createHash('sha256')
    .update(JSON.stringify([
      process.env.POSTGRES_PASSWORD || '',
      process.env.MINIO_SECRET_KEY || '',
      process.env.JWT_SECRET || '',
    ]))
    .digest('hex')

async function guard(req: Parameters<typeof requireSetupToken>[0]) {
  requireSetupToken(req)
  if (await prisma.user.count({ where: { role: 'ADMIN' } }))
    throw new AppError('Setup already completed', 409)
}

router.get('/status', async (_req, res, next) => {
  try {
    res.json({
      needsSetup: !(await prisma.user.count({ where: { role: 'ADMIN' } })),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/readiness', async (req, res, next) => {
  try {
    await guard(req)
    const marker = await prisma.setting.findUnique({
      where: { key: 'setup.credentialsPending' },
    })
    const pending = !!marker && marker.value !== credentialFingerprint()
    let storageReady = false
    try {
      await ensureBucket()
      storageReady = true
    } catch {}
    res.json({ ready: storageReady && !pending, requiresRecreation: pending })
  } catch (err) {
    next(err)
  }
})

router.post('/', rateLimiter('setup', 20, 15 * 60_000), async (req, res, next) => {
  try {
    requireSetupToken(req)
    const { email, username, password, baseUrl } = z
      .object({
        email: z.string().email(),
        username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
        password: passwordSchema,
        baseUrl: z.string().url().refine((value) => {
          const url = new URL(value)
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username && !url.password && !url.search && !url.hash &&
            url.pathname === '/'
          )
        }).optional(),
      })
      .strict()
      .parse(req.body)
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await withJob('bootstrap', async (tx) => {
      if (await tx.user.count({ where: { role: 'ADMIN' } }))
        throw new AppError('Setup already completed', 409)
      const marker = await tx.setting.findUnique({
        where: { key: 'setup.credentialsPending' },
      })
      if (marker && marker.value !== credentialFingerprint())
        throw new AppError(
          'Load the saved deployment environment and recreate the app and MinIO before completing setup',
          409
        )
      await ensureBucket()
      const user = await tx.user.create({
        data: {
          email,
          username,
          password: passwordHash,
          role: 'ADMIN',
          emailVerified: true,
        },
      })
      if (baseUrl)
        await tx.setting.upsert({
          where: { key: 'app.baseUrl' },
          create: { key: 'app.baseUrl', value: baseUrl.replace(/\/$/, '') },
          update: { value: baseUrl.replace(/\/$/, '') },
        })
      await tx.setting.deleteMany({
        where: { key: 'setup.credentialsPending' },
      })
      return user
    })
    res.status(201).json({
      message: 'Admin account created',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    })
  } catch (err) {
    next(err)
  }
})

export { router as setupRouter }
