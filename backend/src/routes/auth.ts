import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma'
import { config } from '../config'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { getSetting } from './settings'
import { sendVerificationEmail } from '../services/email'
import { log } from '../services/logger'

const router = Router()

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

function signToken(user: { id: string; email: string; username: string; role: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: '7d' }
  )
}

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const registrationEnabled = await getSetting('security.registrationEnabled')
    if (registrationEnabled === 'false') {
      throw new AppError('Registration is currently disabled', 403)
    }

    const { email, username, password } = registerSchema.parse(req.body)

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    })
    if (existing) {
      throw new AppError('Email or username already taken', 409)
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const requireVerification = await getSetting('security.requireEmailVerification')
    const emailEnabled = await getSetting('email.enabled')
    const needsVerification = requireVerification === 'true' && emailEnabled === 'true'

    if (needsVerification) {
      const verificationToken = crypto.randomBytes(32).toString('hex')
      const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)

      // Test that email works before creating the user, so we don't leave orphaned unverified accounts
      try {
        await sendVerificationEmail(email, verificationToken)
      } catch {
        throw new AppError('Failed to send verification email. Please check email settings.', 500)
      }

      await prisma.user.create({
        data: {
          email,
          username,
          password: passwordHash,
          emailVerified: false,
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationExpiry,
        },
      })

      await log('info', 'auth', `User registered (pending verification): ${email}`, { ip: req.ip })
      return res.status(202).json({ needsVerification: true })
    }

    const user = await prisma.user.create({
      data: { email, username, password: passwordHash, emailVerified: true },
    })

    await log('info', 'auth', `User registered: ${username}`, { userId: user.id, ip: req.ip })
    const token = signToken(user)
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      await log('warn', 'auth', `Failed login attempt (unknown email): ${email}`, { ip: req.ip })
      throw new AppError('Invalid credentials', 401)
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      await log('warn', 'auth', `Failed login attempt (wrong password): ${email}`, { userId: user.id, ip: req.ip })
      throw new AppError('Invalid credentials', 401)
    }

    const requireVerification = await getSetting('security.requireEmailVerification')
    if (requireVerification === 'true' && !user.emailVerified) {
      throw new AppError('Please verify your email address before logging in', 403)
    }

    await log('info', 'auth', `User logged in: ${user.username}`, { userId: user.id, ip: req.ip })
    const token = signToken(user)
    res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    })
  } catch (err) {
    next(err)
  }
})

router.get('/verify-email', async (req, res, next) => {
  try {
    const token = req.query.token as string
    if (!token) throw new AppError('Missing verification token', 400)

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiry: { gt: new Date() },
      },
    })
    if (!user) throw new AppError('Invalid or expired verification link', 400)

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    })

    const jwtToken = signToken(updated)
    res.json({
      token: jwtToken,
      user: { id: updated.id, email: updated.email, username: updated.username, role: updated.role },
    })
  } catch (err) {
    next(err)
  }
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, username: true, role: true, storageUsed: true, createdAt: true },
    })
    if (!user) throw new AppError('User not found', 404)
    res.json({ user: { ...user, storageUsed: user.storageUsed.toString() } })
  } catch (err) {
    next(err)
  }
})

export { router as authRouter }
