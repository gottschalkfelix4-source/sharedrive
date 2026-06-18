import { Router } from 'express'
import fs from 'fs'
import { prisma } from '../lib/prisma'
import { requireAdmin, requireAuth } from '../middleware/auth'
import { sendTestEmail } from '../services/email'

const router = Router()

export const DEFAULT_SETTINGS: Record<string, string> = {
  'app.name': 'ShareDrive',
  'app.baseUrl': 'http://localhost',
  'app.description': 'Fast, secure & beautiful file sharing',
  'app.maxFilesPerTransfer': '100',
  'storage.maxFileSizeBytes': '5368709120',
  'storage.maxTransferSizeBytes': '10737418240',
  'storage.userStorageQuotaBytes': '0',
  'storage.retentionDaysAnonymous': '7',
  'storage.retentionDaysRegistered': '30',
  'email.enabled': 'false',
  'email.host': '',
  'email.port': '587',
  'email.secure': 'false',
  'email.user': '',
  'email.password': '',
  'email.from': 'noreply@sharedrive.local',
  'security.registrationEnabled': 'true',
  'security.requireEmailVerification': 'false',
  'appearance.primaryColor': '#6366f1',
  'appearance.logoUrl': '',
  'appearance.faviconUrl': '',
  'privacy.logRetentionDays': '30',
  'legal.privacyPolicy': '',
  'legal.imprint': '',
}

export async function getSetting(key: string): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key } })
  return setting?.value ?? DEFAULT_SETTINGS[key] ?? ''
}

export async function getSettings(): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany()
  const result: Record<string, string> = { ...DEFAULT_SETTINGS }
  for (const s of settings) {
    result[s.key] = s.value
  }
  return result
}

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const settings = await getSettings()
    // Mask password fields for security
    const safe = { ...settings }
    if (safe['email.password']) safe['email.password'] = '••••••••'
    res.json({ settings: safe })
  } catch (err) {
    next(err)
  }
})

router.put('/', requireAdmin, async (req, res, next) => {
  try {
    const updates: Record<string, string> = req.body.settings || {}
    const ops = Object.entries(updates).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
    await Promise.all(ops)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

router.post('/test-email', requireAdmin, async (req, res, next) => {
  try {
    const { to } = req.body
    if (!to) throw new Error('Missing recipient email')
    await sendTestEmail(to)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Email test failed' })
  }
})

router.get('/public', async (req, res, next) => {
  try {
    const settings = await getSettings()
    res.json({
      appName: settings['app.name'],
      appDescription: settings['app.description'],
      primaryColor: settings['appearance.primaryColor'],
      logoUrl: settings['appearance.logoUrl'] || '',
      faviconUrl: settings['appearance.faviconUrl'] || '',
      registrationEnabled: settings['security.registrationEnabled'] === 'true',
      maxFileSizeBytes: parseInt(settings['storage.maxFileSizeBytes']),
      maxTransferSizeBytes: parseInt(settings['storage.maxTransferSizeBytes']),
      userStorageQuotaBytes: parseInt(settings['storage.userStorageQuotaBytes'] || '0'),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/legal', async (req, res, next) => {
  try {
    const settings = await getSettings()
    res.json({
      privacyPolicy: settings['legal.privacyPolicy'] || '',
      imprint: settings['legal.imprint'] || '',
    })
  } catch (err) {
    next(err)
  }
})

router.get('/disk-stats', async (req, res, next) => {
  try {
    const stats = fs.statfsSync('/')
    const total = stats.blocks * stats.bsize
    const free = stats.bfree * stats.bsize
    const used = total - free
    const pct = Math.round((used / total) * 100)

    // Next expiring active transfer — tells users when space will be freed
    const next = await prisma.transfer.findFirst({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true },
    })

    res.json({ total, used, free, pct, nextExpiryAt: next?.expiresAt ?? null })
  } catch (err) {
    next(err)
  }
})

export { router as settingsRouter }
