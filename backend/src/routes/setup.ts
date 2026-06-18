import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

const router = Router()

async function adminExists(): Promise<boolean> {
  const count = await prisma.user.count({ where: { role: 'ADMIN' } })
  return count > 0
}

router.get('/status', async (_req, res, next) => {
  try {
    const needsSetup = !(await adminExists())
    res.json({ needsSetup })
  } catch (err) {
    next(err)
  }
})

const setupSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  baseUrl: z.string().url().optional(),
})

router.post('/', async (req, res, next) => {
  try {
    if (await adminExists()) {
      throw new AppError('Setup already completed', 409)
    }

    const { email, username, password, baseUrl } = setupSchema.parse(req.body)

    if (baseUrl) {
      await prisma.setting.upsert({
        where: { key: 'app.baseUrl' },
        update: { value: baseUrl.replace(/\/$/, '') },
        create: { key: 'app.baseUrl', value: baseUrl.replace(/\/$/, '') },
      })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, username, password: passwordHash, role: 'ADMIN', emailVerified: true },
    })

    res.status(201).json({
      message: 'Admin account created successfully',
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    })
  } catch (err) {
    next(err)
  }
})

export { router as setupRouter }
