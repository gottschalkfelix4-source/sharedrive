import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' })
    return
  }
  console.error('Unhandled error:', err)
  // Log unexpected errors asynchronously — import lazily to avoid circular deps
  import('../services/logger').then(({ log }) => {
    log('error', 'error', `${req.method} ${req.path} — ${err.message}`, { ip: req.ip }).catch(() => {})
  }).catch(() => {})
  res.status(500).json({ error: 'Internal server error' })
}
