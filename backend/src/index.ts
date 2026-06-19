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

const app = express()

app.set('trust proxy', 1)

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)
app.use(
  cors({
    origin: true,
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
