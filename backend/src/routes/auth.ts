import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { authenticator } from 'otplib'
import qrcode from 'qrcode'
import { prisma } from '../lib/prisma'
import { config } from '../config'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { getSetting } from './settings'
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email'
import { log } from '../services/logger'
import { passwordSchema } from '../lib/validation'

const router = Router()

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: passwordSchema,
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: passwordSchema,
})

const twoFactorVerifySchema = z.object({
  code: z.string().min(6).max(6),
})

const twoFactorDisableSchema = z.object({
  password: z.string(),
})

const twoFactorLoginSchema = z.object({
  challengeToken: z.string(),
  code: z.string().min(6).max(11),
})

function signToken(user: { id: string; email: string; username: string; role: string; tokenVersion: number }): string {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username, role: user.role, tokenVersion: user.tokenVersion },
    config.jwtSecret,
    { expiresIn: '7d' }
  )
}

function signChallengeToken(userId: string): string {
  return jwt.sign({ id: userId, twoFactorPending: true }, config.jwtSecret, { expiresIn: '5m' })
}

function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase()
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

// Checks a submitted 2FA code against the TOTP secret first, then falls back to
// single-use backup codes — a matched backup code is immediately removed.
async function verifyTwoFactorCode(
  user: { id: string; totpSecret: string | null; totpBackupCodes: string[] },
  code: string
): Promise<boolean> {
  const normalized = code.trim()

  if (user.totpSecret && /^\d{6}$/.test(normalized) && authenticator.verify({ token: normalized, secret: user.totpSecret })) {
    return true
  }

  for (const hash of user.totpBackupCodes) {
    if (await bcrypt.compare(normalized.toUpperCase(), hash)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { totpBackupCodes: user.totpBackupCodes.filter((h) => h !== hash) },
      })
      return true
    }
  }

  return false
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

    if (user.totpEnabled) {
      const challengeToken = signChallengeToken(user.id)
      await log('info', 'auth', `2FA challenge issued: ${user.username}`, { userId: user.id, ip: req.ip })
      return res.json({ requiresTwoFactor: true, challengeToken })
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

router.post('/2fa/login', authLimiter, async (req, res, next) => {
  try {
    const { challengeToken, code } = twoFactorLoginSchema.parse(req.body)

    let payload: { id: string; twoFactorPending?: boolean }
    try {
      payload = jwt.verify(challengeToken, config.jwtSecret) as typeof payload
    } catch {
      throw new AppError('Invalid or expired challenge', 401)
    }
    if (!payload.twoFactorPending) throw new AppError('Invalid challenge token', 401)

    const user = await prisma.user.findUnique({ where: { id: payload.id } })
    if (!user || !user.totpEnabled || !user.totpSecret) throw new AppError('Invalid challenge', 401)

    const verified = await verifyTwoFactorCode(user, code)
    if (!verified) {
      await log('warn', 'auth', `Failed 2FA login attempt: ${user.username}`, { userId: user.id, ip: req.ip })
      throw new AppError('Invalid two-factor code', 401)
    }

    await log('info', 'auth', `User logged in (2FA): ${user.username}`, { userId: user.id, ip: req.ip })
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

router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex')
      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000)

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: resetToken, passwordResetExpiry: resetExpiry },
      })

      try {
        await sendPasswordResetEmail(email, resetToken)
      } catch {
        await log('error', 'auth', `Failed to send password reset email: ${email}`, { userId: user.id, ip: req.ip })
      }

      await log('info', 'auth', `Password reset requested: ${user.username}`, { userId: user.id, ip: req.ip })
    }

    // Same response whether or not the email exists, to avoid leaking which addresses are registered
    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' })
  } catch (err) {
    next(err)
  }
})

router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body)

    const user = await prisma.user.findFirst({
      where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } },
    })
    if (!user) throw new AppError('Invalid or expired reset link', 400)

    const passwordHash = await bcrypt.hash(password, 12)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        tokenVersion: { increment: 1 },
      },
    })

    await log('info', 'auth', `Password reset completed: ${user.username}`, { userId: user.id, ip: req.ip })
    const jwtToken = signToken(updated)
    res.json({
      token: jwtToken,
      user: { id: updated.id, email: updated.email, username: updated.username, role: updated.role },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/change-password', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) throw new AppError('User not found', 404)

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) throw new AppError('Current password is incorrect', 401)

    const passwordHash = await bcrypt.hash(newPassword, 12)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash, tokenVersion: { increment: 1 } },
    })

    await log('info', 'auth', `Password changed: ${user.username}`, { userId: user.id, ip: req.ip })
    const token = signToken(updated)
    res.json({
      token,
      user: { id: updated.id, email: updated.email, username: updated.username, role: updated.role },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { tokenVersion: { increment: 1 } },
    })
    await log('info', 'auth', `Logged out of all devices: ${req.user!.username}`, { userId: req.user!.id, ip: req.ip })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const appName = (await getSetting('app.name')) || 'ShareDrive'
    const secret = authenticator.generateSecret()
    const otpauthUrl = authenticator.keyuri(req.user!.email, appName, secret)
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl)

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: secret },
    })

    res.json({ secret, qrCodeDataUrl })
  } catch (err) {
    next(err)
  }
})

router.post('/2fa/verify', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const { code } = twoFactorVerifySchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user?.totpSecret) throw new AppError('Two-factor setup has not been started', 400)

    const valid = authenticator.verify({ token: code, secret: user.totpSecret })
    if (!valid) throw new AppError('Invalid code', 400)

    const backupCodes = generateBackupCodes()
    const hashedCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 12)))

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, totpBackupCodes: hashedCodes, tokenVersion: { increment: 1 } },
    })

    await log('info', 'auth', `2FA enabled: ${user.username}`, { userId: user.id, ip: req.ip })
    const token = signToken(updated)
    res.json({
      token,
      backupCodes,
      user: { id: updated.id, email: updated.email, username: updated.username, role: updated.role },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/2fa/disable', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const { password } = twoFactorDisableSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) throw new AppError('User not found', 404)

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) throw new AppError('Incorrect password', 401)

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null, totpBackupCodes: [], tokenVersion: { increment: 1 } },
    })

    await log('info', 'auth', `2FA disabled: ${user.username}`, { userId: user.id, ip: req.ip })
    const token = signToken(updated)
    res.json({
      token,
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
      select: { id: true, email: true, username: true, role: true, storageUsed: true, createdAt: true, totpEnabled: true },
    })
    if (!user) throw new AppError('User not found', 404)
    res.json({ user: { ...user, storageUsed: user.storageUsed.toString() } })
  } catch (err) {
    next(err)
  }
})

export { router as authRouter }
