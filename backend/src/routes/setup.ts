import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import fs from 'fs'
import http from 'http'
import { createHash } from 'crypto'
import { prisma, reconnectPrisma } from '../lib/prisma'
import { withJob } from '../lib/jobs'
import { AppError } from '../middleware/errorHandler'
import { passwordSchema } from '../lib/validation'
import { requireSetupToken, setEnvVar } from '../lib/bootstrap'
import { rateLimiter } from '../lib/rateLimit'
import { ensureBucket, reloadLocalStorage } from '../lib/minio'

const router = Router()
let credentialsRecreationPending = false
const envPath = () => process.env.ENV_FILE_PATH || '/app/.env'
const credentialFingerprint = (
  db = process.env.POSTGRES_PASSWORD || '',
  minio = process.env.MINIO_SECRET_KEY || '',
  jwt = process.env.JWT_SECRET || ''
) =>
  createHash('sha256')
    .update(JSON.stringify([db, minio, jwt]))
    .digest('hex')
const caddyPath = () => process.env.CADDYFILE_PATH || '/app/Caddyfile'
const hostname = z
  .string()
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
  )
const credential = z
  .string()
  .min(16)
  .max(256)
  .refine(
    (v) => !/[\s\x00\x22\x27\x5c$#]/.test(v),
    'Whitespace, quotes, backslashes, $ and # are not supported'
  )
async function guard(req: Parameters<typeof requireSetupToken>[0]) {
  requireSetupToken(req)
  if (await prisma.user.count({ where: { role: 'ADMIN' } }))
    throw new AppError('Setup already completed', 409)
}
async function caddyRequest(
  path: string,
  body: string,
  contentType: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: process.env.CADDY_ADMIN_HOST || 'caddy',
        port: 2019,
        path,
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': Buffer.byteLength(body),
          Origin: 'http://caddy:2019',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => {
          data += c
          if (data.length > 1024 * 1024)
            req.destroy(new Error('Invalid Caddy response'))
        })
        res.on('end', () =>
          res.statusCode && res.statusCode < 300
            ? resolve(data)
            : reject(new AppError('Caddy configuration rejected', 502))
        )
      }
    )
    req.setTimeout(10_000, () => req.destroy(new Error('Caddy timeout')))
    req.on('error', reject)
    req.end(body)
  })
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
    const pending =
      credentialsRecreationPending ||
      (!!marker && marker.value !== credentialFingerprint())
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
router.use(rateLimiter('setup', 20, 15 * 60_000))
// Serialize local changes through client reconnects as well as the DB transaction.
let setupTail = Promise.resolve()
router.use((req, res, next) => {
  if (req.method !== 'POST') {
    next()
    return
  }
  const previous = setupTail
  setupTail = new Promise<void>((resolve) => {
    res.once('finish', resolve)
    res.once('close', resolve)
  })
  void previous.then(() => {
    if (!res.destroyed) next()
  })
})
router.post('/credentials', async (req, res, next) => {
  try {
    requireSetupToken(req)
    if (credentialsRecreationPending)
      throw new AppError(
        'Recreate the backend and MinIO before rotating again',
        409
      )
    const { dbPassword, minioPassword, jwtSecret } = z
      .object({
        dbPassword: credential,
        minioPassword: credential,
        jwtSecret: credential.refine(
          (v) => v.length >= 32,
          'JWT secret must contain at least 32 characters'
        ),
      })
      .strict()
      .parse(req.body)
    // Serialize the entire operation, including filesystem and process state, with setup.
    await withJob('bootstrap', async (tx) => {
      if (await tx.user.count({ where: { role: 'ADMIN' } }))
        throw new AppError('Setup already completed', 409)
      const old = fs.readFileSync(envPath(), 'utf8')
      const dbUser = process.env.POSTGRES_USER || 'sharedrive'
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(dbUser))
        throw new AppError('Unsupported database role name', 400)
      const current = new URL(process.env.DATABASE_URL || '')
      current.password = dbPassword
      const url = current.toString()
      let content = old
      for (const [key, value] of Object.entries({
        POSTGRES_PASSWORD: dbPassword,
        DATABASE_URL: url,
        MINIO_ROOT_PASSWORD: minioPassword,
        MINIO_SECRET_KEY: minioPassword,
        JWT_SECRET: jwtSecret,
      }))
        content = setEnvVar(content, key, value)
      // Keep the bind-mounted inode. DB changes roll back if file persistence fails.
      const escaped = dbPassword.replace(/'/g, "''")
      await tx.$executeRawUnsafe(
        `ALTER ROLE "${dbUser}" WITH PASSWORD '${escaped}'`
      )
      try {
        fs.writeFileSync(envPath(), content, { mode: 0o600 })
        await tx.setting.upsert({
          where: { key: 'setup.credentialsPending' },
          create: {
            key: 'setup.credentialsPending',
            value: credentialFingerprint(dbPassword, minioPassword, jwtSecret),
          },
          update: {
            value: credentialFingerprint(dbPassword, minioPassword, jwtSecret),
          },
        })
      } catch (err) {
        fs.writeFileSync(envPath(), old)
        throw err
      }
    })
    // The old connection remains valid until this transaction commits.
    credentialsRecreationPending = true
    const newUrl = new URL(process.env.DATABASE_URL || '')
    newUrl.password = dbPassword
    await reconnectPrisma(newUrl.toString())
    Object.assign(process.env, {
      DATABASE_URL: newUrl.toString(),
      POSTGRES_PASSWORD: dbPassword,
      JWT_SECRET: jwtSecret,
      MINIO_SECRET_KEY: minioPassword,
      MINIO_ROOT_PASSWORD: minioPassword,
    })
    reloadLocalStorage()
    credentialsRecreationPending = true
    res.json({
      ok: true,
      requiresRecreation: true,
      message:
        'Recreate MinIO and the backend to load the saved environment before completing setup.',
    })
  } catch (err) {
    next(err)
  }
})
router.post('/ssl', async (req, res, next) => {
  try {
    const { domain, acmeEmail } = z
      .object({
        domain: hostname,
        acmeEmail: z.string().email().optional().or(z.literal('')),
      })
      .strict()
      .parse(req.body)
    await withJob('bootstrap', async (tx) => {
      requireSetupToken(req)
      if (await tx.user.count({ where: { role: 'ADMIN' } }))
        throw new AppError('Setup already completed', 409)
      const body = `{\n admin 0.0.0.0:2019 {\n origins http://localhost http://caddy:2019\n }\n${acmeEmail ? ` email ${acmeEmail}\n` : ''}}\n${domain} {\n reverse_proxy nginx:80\n}\n`
      const adapted = await caddyRequest('/adapt', body, 'text/caddyfile')
      const configuration = JSON.stringify(JSON.parse(adapted).result)
      const old = fs.readFileSync(caddyPath(), 'utf8')
      // Validate before persisting, retain old config for rollback.
      fs.writeFileSync(caddyPath(), body)
      try {
        await caddyRequest('/load', configuration, 'application/json')
        await tx.setting.upsert({
          where: { key: 'app.baseUrl' },
          create: { key: 'app.baseUrl', value: `https://${domain}` },
          update: { value: `https://${domain}` },
        })
      } catch (err) {
        fs.writeFileSync(caddyPath(), old)
        await caddyRequest('/load', old, 'text/caddyfile').catch(() => {})
        throw err
      }
    })
    res.json({ ok: true, baseUrl: `https://${domain}` })
  } catch (err) {
    next(err)
  }
})
router.post('/', async (req, res, next) => {
  try {
    requireSetupToken(req)
    const { email, username, password, baseUrl } = z
      .object({
        email: z.string().email(),
        username: z
          .string()
          .min(3)
          .max(32)
          .regex(/^[a-zA-Z0-9_-]+$/),
        password: passwordSchema,
        baseUrl: z
          .string()
          .url()
          .refine((v) => {
            const u = new URL(v)
            return (
              ['http:', 'https:'].includes(u.protocol) &&
              !u.username &&
              !u.password &&
              !u.search &&
              !u.hash
            )
          })
          .optional(),
      })
      .strict()
      .parse(req.body)
    const passwordHash = await bcrypt.hash(password, 12)
    // Credentials must actually work; the saved file alone is not readiness evidence.
    if (credentialsRecreationPending)
      throw new AppError(
        'Recreate the backend and MinIO before completing setup',
        409
      )
    const user = await withJob('bootstrap', async (tx) => {
      if (await tx.user.count({ where: { role: 'ADMIN' } }))
        throw new AppError('Setup already completed', 409)
      const marker = await tx.setting.findUnique({
        where: { key: 'setup.credentialsPending' },
      })
      if (
        credentialsRecreationPending ||
        (marker && marker.value !== credentialFingerprint())
      )
        throw new AppError(
          'Recreate the backend and MinIO before completing setup',
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
    res
      .status(201)
      .json({
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
