import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import fs from 'fs'
import http from 'http'
import { prisma, reconnectPrisma } from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { passwordSchema } from '../lib/validation'

const ENV_PATH = '/app/.env'

const router = Router()
const CADDYFILE_PATH = '/app/Caddyfile'

async function adminExists(): Promise<boolean> {
  const count = await prisma.user.count({ where: { role: 'ADMIN' } })
  return count > 0
}

function buildCaddyfile(domain: string, acmeEmail?: string): string {
  const emailLine = acmeEmail ? `    email ${acmeEmail}\n` : ''
  return [
    '{',
    '    admin 0.0.0.0:2019 {',
    '        origins http://localhost http://caddy:2019',
    '    }',
    emailLine ? emailLine.trimEnd() : '',
    '}',
    '',
    `${domain} {`,
    '    reverse_proxy nginx:80',
    '}',
    '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

// Calls the Caddy Admin API using Node's http module so headers are always sent as-is.
function caddyLoad(caddyfile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(caddyfile, 'utf8')
    const req = http.request(
      {
        hostname: 'caddy',
        port:     2019,
        path:     '/load',
        method:   'POST',
        headers:  {
          'Content-Type':   'text/caddyfile',
          'Content-Length': body.length,
          'Origin':         'http://caddy:2019',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          if (res.statusCode && res.statusCode < 300) resolve()
          else reject(new AppError(`Caddy reload fehlgeschlagen: ${data}`, 502))
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

router.get('/status', async (_req, res, next) => {
  try {
    const needsSetup = !(await adminExists())
    res.json({ needsSetup })
  } catch (err) {
    next(err)
  }
})

function setEnvVar(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, 'm')
  return regex.test(content)
    ? content.replace(regex, `${key}=${value}`)
    : `${content}\n${key}=${value}`
}

// Applies new infrastructure credentials: writes .env and changes postgres password live
router.post('/credentials', async (req, res, next) => {
  try {
    if (await adminExists()) throw new AppError('Setup already completed', 403)

    const { dbPassword, minioPassword, jwtSecret } = z.object({
      dbPassword:    z.string().min(8),
      minioPassword: z.string().min(8),
      jwtSecret:     z.string().min(16),
    }).parse(req.body)

    const dbUser = process.env.POSTGRES_USER || 'sharedrive'
    const dbName = process.env.POSTGRES_DB   || 'sharedrive'

    // 1. Update .env on disk (bind-mounted from host)
    let envContent = fs.readFileSync(ENV_PATH, 'utf8')
    envContent = setEnvVar(envContent, 'POSTGRES_PASSWORD', dbPassword)
    envContent = setEnvVar(envContent, 'DATABASE_URL',
      `postgresql://${dbUser}:${dbPassword}@postgres:5432/${dbName}`)
    envContent = setEnvVar(envContent, 'MINIO_ROOT_PASSWORD', minioPassword)
    envContent = setEnvVar(envContent, 'MINIO_SECRET_KEY',    minioPassword)
    envContent = setEnvVar(envContent, 'JWT_SECRET',           jwtSecret)
    fs.writeFileSync(ENV_PATH, envContent, 'utf8')

    // 2. Change postgres password live, then reconnect Prisma with the new URL
    const escapedPass = dbPassword.replace(/'/g, "''")
    await prisma.$executeRawUnsafe(
      `ALTER ROLE "${dbUser}" WITH PASSWORD '${escapedPass}'`
    )
    const newDbUrl = `postgresql://${dbUser}:${dbPassword}@postgres:5432/${dbName}`
    await reconnectPrisma(newDbUrl)

    // 3. Update in-process env so new tokens use new secret
    process.env.JWT_SECRET           = jwtSecret
    process.env.MINIO_ROOT_PASSWORD  = minioPassword
    process.env.MINIO_SECRET_KEY     = minioPassword

    res.json({ ok: true })
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

    // Reload Caddy via Admin API using Node's http module (fetch strips custom headers in some runtimes)
    await caddyLoad(caddyfile)

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
  password: passwordSchema,
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
