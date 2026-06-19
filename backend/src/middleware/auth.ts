import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { prisma } from '../lib/prisma'

export interface AuthUser {
  id: string
  email: string
  username: string
  role: string
}

interface AuthTokenPayload {
  id: string
  email: string
  username: string
  role: string
  tokenVersion: number
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

// Re-reads role/email/username from the DB and rejects the token if its
// tokenVersion is stale — this is what makes password changes, role changes,
// and "log out everywhere" actually invalidate previously issued JWTs.
async function resolveAuthUser(token: string): Promise<AuthUser | null> {
  let payload: AuthTokenPayload
  try {
    payload = jwt.verify(token, config.jwtSecret) as AuthTokenPayload
  } catch {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, username: true, role: true, tokenVersion: true },
  })
  if (!user || user.tokenVersion !== payload.tokenVersion) return null

  return { id: user.id, email: user.email, username: user.username, role: user.role }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  const user = await resolveAuthUser(token)
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }
  req.user = user
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' })
      return
    }
    next()
  })
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token
  if (token) {
    const user = await resolveAuthUser(token)
    if (user) req.user = user
  }
  next()
}
