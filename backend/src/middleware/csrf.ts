import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { AppError } from './errorHandler'
export function csrfProtection(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (
    ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
    !req.cookies?.token ||
    req.get('authorization')
  ) {
    next()
    return
  }
  const supplied = req.get('x-csrf-token') || '',
    expected = req.cookies.csrf || ''
  const origin = req.get('origin')
  if (
    !expected ||
    !crypto.timingSafeEqual(
      crypto.createHash('sha256').update(supplied).digest(),
      crypto.createHash('sha256').update(expected).digest()
    ) ||
    (origin && origin !== `${req.protocol}://${req.get('host')}`)
  ) {
    next(new AppError('CSRF validation failed', 403))
    return
  }
  next()
}
