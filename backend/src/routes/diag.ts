import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { requireAdmin } from '../middleware/auth'
import { rateLimiter } from '../lib/rateLimit'
import { AppError } from '../middleware/errorHandler'

const router = Router()
export function diagnosticToken(): string {
  return jwt.sign({ kind: 'diagnostic' }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '5m',
  })
}
router.use(requireAdmin, rateLimiter('diagnostic', 10, 60_000))
router.use((req, res, next) => {
  try {
    const token = req.get('x-diag-key') || ''
    const data = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload
    if (data.kind !== 'diagnostic') throw new Error('Invalid token')
    res.setHeader('Cache-Control', 'no-store')
    next()
  } catch {
    next(new AppError('Valid diagnostic header required', 401))
  }
})
router.get('/', (req, res) => {
  const headers = Object.fromEntries(
    [
      'host',
      'user-agent',
      'content-type',
      'content-length',
      'x-forwarded-for',
      'x-forwarded-proto',
    ]
      .filter((k) => req.get(k))
      .map((k) => [k, req.get(k)])
  )
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    method: req.method,
    ip: req.ip,
    protocol: req.protocol,
    headers,
    server: {
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
    },
  })
})
router.post('/upload', (req, res, next) => {
  let bytes = 0
  const start = Date.now()
  req.on('data', (chunk: Buffer) => {
    bytes += chunk.length
    if (bytes > 100 * 1024 * 1024) {
      req.destroy()
      next(new AppError('Diagnostic upload exceeds 100 MiB', 413))
    }
  })
  req.on('error', next)
  req.on('end', () =>
    res.json({ ok: true, bytesReceived: bytes, elapsedMs: Date.now() - start })
  )
})
export { router as diagRouter }
