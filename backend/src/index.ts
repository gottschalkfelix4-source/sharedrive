import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { authRouter } from './routes/auth'
import { chunkedUploadRouter } from './routes/chunkedUpload'
import { transfersRouter } from './routes/transfers'
import { downloadRouter } from './routes/download'
import { adminRouter } from './routes/admin'
import { settingsRouter } from './routes/settings'
import { scanRouter } from './routes/scan'
import { setupRouter } from './routes/setup'
import { assetsRouter } from './routes/assets'
import { diagRouter, DIAG_TOKEN } from './routes/diag'
import { errorHandler } from './middleware/errorHandler'
import { startCleanupService } from './services/cleanup'
import { seedSettings } from './services/seed'
import { ensureBucket } from './lib/minio'
import { log } from './services/logger'
import { config } from './config'
import { prisma } from './lib/prisma'

// Detects whether default/placeholder secrets from .env.example are still in use
// once an admin account already exists (i.e. setup should have rotated them).
// Doesn't block startup — the setup wizard itself needs the server running
// with these very placeholders before it can replace them.
async function warnIfInsecureDefaults(): Promise<void> {
  try {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
    if (adminCount === 0) return

    const insecure: string[] = []
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-to-a-long-random-secret-string') {
      insecure.push('JWT_SECRET')
    }
    if (process.env.POSTGRES_PASSWORD === 'change_me_db') insecure.push('POSTGRES_PASSWORD')
    if (process.env.MINIO_ROOT_PASSWORD === 'change_me_minio' || process.env.MINIO_SECRET_KEY === 'change_me_minio') {
      insecure.push('MINIO_ROOT_PASSWORD / MINIO_SECRET_KEY')
    }

    if (insecure.length > 0) {
      const msg = `SECURITY WARNING: default/placeholder values still in use for: ${insecure.join(', ')}. Rotate them now (Setup-Assistent unter /setup oder manuell in .env + Neustart).`
      console.warn(msg)
      await log('warn', 'system', msg).catch(() => {})
    }
  } catch {
    // best-effort — never block startup on this check
  }
}

const app = express()

app.set('trust proxy', 1)

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)
// Frontend and API are always served same-origin through nginx/Caddy, so the
// app itself never needs cross-origin access in production. `origin: true`
// would reflect any requesting site back as an allowed, credentialed origin —
// only keep that permissiveness for local dev (Vite proxy already makes dev
// requests same-origin too, so this mainly guards against stray dev tooling).
app.use(
  cors({
    origin: config.nodeEnv === 'production' ? false : true,
    credentials: true,
  })
)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.use('/api/setup', setupRouter)
app.use('/api/auth', authRouter)
app.use('/api/transfers/chunked', chunkedUploadRouter)
app.use('/api/transfers', transfersRouter)
app.use('/api/d', downloadRouter)
app.use('/api/admin', adminRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/scan', scanRouter)
app.use('/api/assets', assetsRouter)
app.use('/api/diag', diagRouter)

app.get('/api/health', (_, res) => res.json({ ok: true }))

app.use(errorHandler)

async function start() {
  try {
    await ensureBucket()
    await seedSettings()
    await warnIfInsecureDefaults()
    startCleanupService()

    app.listen(config.port, async () => {
      console.log(`ShareDrive backend running on port ${config.port}`)
      await log('info', 'system', `Server started on port ${config.port}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()
