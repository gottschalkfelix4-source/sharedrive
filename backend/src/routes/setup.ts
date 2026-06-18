import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import fs from 'fs'
import { prisma } from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

const router = Router()
const CADDYFILE_PATH = '/app/Caddyfile'
const CADDY_ADMIN = 'http://caddy:2019'

async function adminExists(): Promise<boolean> {
  const count = await prisma.user.count({ where: { role: 'ADMIN' } })
  return count > 0
}

function buildCaddyfile(domain: string, acmeEmail?: string): string {
  const emailLine = acmeEmail ? `    email ${acmeEmail}\n` : ''
  return `{\n    admin 0.0.0.0:2019\n${emailLine}}\n\n${domain} {\n    reverse_proxy nginx:80\n}\n`
}

router.get('/status', async (_req, res, next) => {
  try {
    const needsSetup = !(await adminExists())
    res.json({ needsSetup })
  } catch (err) {
    next(err)
  }
})

// Returns generated infrastructure credentials — only callable before setup is complete
router.get('/env', async (_req, res, next) => {
  try {
    if (await adminExists()) throw new AppError('Setup already completed', 403)
    res.json({
      dbPassword:    process.env.POSTGRES_PASSWORD || '',
      dbUser:        process.env.POSTGRES_USER     || 'sharedrive',
      dbName:        process.env.POSTGRES_DB       || 'sharedrive',
      minioUser:     process.env.MINIO_ROOT_USER   || 'minioadmin',
      minioPassword: process.env.MINIO_ROOT_PASSWORD || '',
      jwtSecret:     process.env.JWT_SECRET        || '',
    })
  } catch (err) {
    next(err)
  }
})

// Applies SSL: writes Caddyfile and reloads Caddy via Admin API
router.post('/ssl', async (req, res, next) => {
  try {
    if (await adminExists()) throw new AppError('Setup already completed', 403)

    const { domain, acmeEmail } = z.object({
      domain:    z.string().min(3),
      acmeEmail: z.string().email().optional().or(z.literal('')),
    }).parse(req.body)

    const caddyfile = buildCaddyfile(domain, acmeEmail || undefined)

    // Write updated Caddyfile (mounted as bind-mount, shared with Caddy container)
    fs.writeFileSync(CADDYFILE_PATH, caddyfile, 'utf8')

    // Reload Caddy via Admin API (no restart needed)
    const reload = await fetch(`${CADDY_ADMIN}/load`, {
      method:  'POST',
      headers: { 'Content-Type': 'text/caddyfile' },
      body:    caddyfile,
    })
    if (!reload.ok) {
      const msg = await reload.text()
      throw new AppError(`Caddy reload fehlgeschlagen: ${msg}`, 502)
    }

    // Save base URL to settings so download links use https://
    await prisma.setting.upsert({
      where:  { key: 'app.baseUrl' },
      update: { value: `https://${domain}` },
      create: { key: 'app.baseUrl', value: `https://${domain}` },
    })

    res.json({ ok: true, baseUrl: `https://${domain}` })
  } catch (err) {
    next(err)
  }
})

const setupSchema = z.object({
  email:    z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  baseUrl:  z.string().url().optional(),
})

router.post('/', async (req, res, next) => {
  try {
    if (await adminExists()) throw new AppError('Setup already completed', 409)

    const { email, username, password, baseUrl } = setupSchema.parse(req.body)

    if (baseUrl) {
      await prisma.setting.upsert({
        where:  { key: 'app.baseUrl' },
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
