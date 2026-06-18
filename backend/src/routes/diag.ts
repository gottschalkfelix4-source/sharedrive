import { Router } from 'express'
import crypto from 'crypto'

const router = Router()

// Stable token derived from JWT_SECRET so it survives restarts but isn't guessable
export const DIAG_TOKEN = crypto
  .createHmac('sha256', process.env.JWT_SECRET || 'change-me-in-production')
  .update('sharedrive-diag-v1')
  .digest('hex')
  .slice(0, 32)

function checkToken(req: any, res: any): boolean {
  const supplied = (req.query.key as string) || req.headers['x-diag-key']
  if (supplied !== DIAG_TOKEN) {
    res.status(401).json({ error: 'Invalid or missing diagnostic key' })
    return false
  }
  return true
}

// GET /api/diag?key=TOKEN
// Returns all headers, IP info, and server info — useful for verifying reverse proxy setup
router.get('/', (req, res) => {
  if (!checkToken(req, res)) return

  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    ips: req.ips,
    protocol: req.protocol,
    headers: req.headers,
    server: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: Math.floor(process.uptime()) + 's',
    },
  })
})

// POST /api/diag/upload?key=TOKEN
// Streams the request body counting bytes — tests whether large bodies reach the backend
// Does NOT buffer into memory; safe for multi-GB test payloads
router.post('/upload', (req, res) => {
  if (!checkToken(req, res)) return

  const start = Date.now()
  let bytesReceived = 0

  req.on('data', (chunk: Buffer) => {
    bytesReceived += chunk.length
  })

  req.on('end', () => {
    const elapsed = Date.now() - start
    res.json({
      ok: true,
      bytesReceived,
      bytesReceivedMB: (bytesReceived / 1024 / 1024).toFixed(2),
      elapsedMs: elapsed,
      throughputMBps: ((bytesReceived / 1024 / 1024) / (elapsed / 1000)).toFixed(2),
      contentLength: req.headers['content-length'] ?? null,
      contentType: req.headers['content-type'] ?? null,
      transferEncoding: req.headers['transfer-encoding'] ?? null,
      via: req.headers['via'] ?? null,
      xForwardedFor: req.headers['x-forwarded-for'] ?? null,
      xRealIp: req.headers['x-real-ip'] ?? null,
    })
  })

  req.on('error', (err) => {
    res.status(500).json({ ok: false, error: err.message, bytesReceived })
  })
})

export { router as diagRouter }
