import express, { Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import path from 'path'

export function configureHttp(app: Express): void {
  app.set(
    'trust proxy',
    (process.env.TRUST_PROXY || 'loopback')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'upgrade-insecure-requests': null,
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        },
      },
      // TLS policy belongs to the external reverse proxy; direct LAN HTTP also works.
      strictTransportSecurity: false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  )
  app.use(
    cors({
      origin: process.env.NODE_ENV === 'production' ? false : true,
      credentials: true,
    })
  )
}

export function serveFrontend(app: Express): void {
  const publicDirectory = path.resolve(
    process.env.FRONTEND_DIST_PATH || path.join(__dirname, '../../public')
  )
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' })
  })
  app.use(express.static(publicDirectory, { index: false, redirect: false }))
  app.get('*', (req, res, next) => {
    // Missing bundle files must stay 404s; only browser navigation gets the SPA.
    if (
      req.path === '/assets' || req.path.startsWith('/assets/') ||
      path.extname(req.path) ||
      !req.accepts('html')
    ) {
      next()
      return
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(publicDirectory, 'index.html'), (error) => {
      if (error) next(error)
    })
  })
}
