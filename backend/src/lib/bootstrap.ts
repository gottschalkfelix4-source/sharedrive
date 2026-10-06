import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Request } from 'express'
import { AppError } from '../middleware/errorHandler'

export function setupToken(): string {
  if (process.env.SETUP_TOKEN) {
    if (process.env.SETUP_TOKEN.length < 32)
      throw new Error('SETUP_TOKEN must contain at least 32 characters')
    return process.env.SETUP_TOKEN
  }
  const file = process.env.SETUP_TOKEN_FILE || path.resolve('.setup-token')
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    try {
      fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), {
        mode: 0o600,
        flag: 'wx',
      })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
  const token = fs.readFileSync(file, 'utf8').trim()
  if (token.length < 32)
    throw new Error('Invalid local setup token; regenerate it before starting')
  return token
}
export function requireSetupToken(req: Request): void {
  const supplied = req.get('x-setup-token') || ''
  const a = crypto.createHash('sha256').update(supplied).digest()
  const b = crypto.createHash('sha256').update(setupToken()).digest()
  if (!crypto.timingSafeEqual(a, b))
    throw new AppError('Valid setup token required', 401)
}
