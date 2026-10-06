import express from 'express'
import cookieParser from 'cookie-parser'
import { configureHttp, serveFrontend } from './lib/http'
import { authRouter } from './routes/auth'
import { chunkedUploadRouter } from './routes/chunkedUpload'
import { transfersRouter } from './routes/transfers'
import { downloadRouter } from './routes/download'
import { adminRouter } from './routes/admin'
import { settingsRouter } from './routes/settings'
import { scanRouter } from './routes/scan'
import { setupRouter } from './routes/setup'
import { assetsRouter } from './routes/assets'
import { diagRouter } from './routes/diag'
import { errorHandler } from './middleware/errorHandler'
import { connectRedis, redisClient } from './lib/rateLimit'
import { setupToken } from './lib/bootstrap'
import { csrfProtection } from './middleware/csrf'
import { startScanWorker } from './services/virusScan'
import { startCleanupService } from './services/cleanup'
import { seedSettings } from './services/seed'
import { ensureBucket } from './lib/minio'
import { log } from './services/logger'
import { config } from './config'
import { prisma } from './lib/prisma'

// Existing installations may still contain placeholder credentials.
async function warnIfInsecureDefaults(): Promise<void> {
  try {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
    if (adminCount === 0) return

    const insecure: string[] = []
    if (
      !process.env.JWT_SECRET ||
      process.env.JWT_SECRET === 'change-me-to-a-long-random-secret-string'
    ) {
      insecure.push('JWT_SECRET')
    }
    if (process.env.POSTGRES_PASSWORD === 'change_me_db')
      insecure.push('POSTGRES_PASSWORD')
    if (
      process.env.MINIO_ROOT_PASSWORD === 'change_me_minio' ||
      process.env.MINIO_SECRET_KEY === 'change_me_minio'
    ) {
      insecure.push('MINIO_ROOT_PASSWORD / MINIO_SECRET_KEY')
    }

    if (insecure.length > 0) {
      const msg = `SECURITY WARNING: default/placeholder values still in use for: ${insecure.join(', ')}. Replace them in the deployment configuration and restart the affected services.`
      console.warn(msg)
      await log('warn', 'system', msg).catch(() => {})
    }
  } catch {
    // best-effort — never block startup on this check
  }
}

export const app = express()

configureHttp(app)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(csrfProtection)

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
app.get('/api/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redisClient.ping()
    await ensureBucket()
    res.json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
})

serveFrontend(app)
app.use(errorHandler)

async function start() {
  try {
    if (
      config.nodeEnv === 'production' &&
      (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    )
      throw new Error(
        'A random JWT_SECRET of at least 32 characters is required'
      )
    await connectRedis()
    setupToken()
    await ensureBucket()
    await seedSettings()
    await warnIfInsecureDefaults()
    const stopCleanup = startCleanupService()
    const stopScans = startScanWorker()

    const server = app.listen(config.port, async () => {
      console.log(`ShareDrive backend running on port ${config.port}`)
      await log('info', 'system', `Server started on port ${config.port}`)
    })
    const shutdown = () => {
      stopCleanup()
      stopScans()
      server.close(() => {
        void Promise.allSettled([
          prisma.$disconnect(),
          redisClient.quit(),
        ]).then(() => process.exit(0))
      })
    }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

if (require.main === module) void start()
