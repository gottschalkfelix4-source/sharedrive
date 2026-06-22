import { Router } from 'express'
import geoip from 'geoip-lite'
import { prisma } from '../lib/prisma'
import { deleteObjects } from '../lib/minio'
import { requireAdmin } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { DIAG_TOKEN } from './diag'
import { uploadSessions } from '../lib/uploadSessions'
import { getActiveDownloads } from '../lib/liveCounters'

const router = Router()

router.use(requireAdmin)

// Dashboard stats
router.get('/stats', async (req, res, next) => {
  try {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const [
      totalUsers,
      activeTransfers,
      expiredTransfers,
      downloadsToday,
      storageResult,
      recentTransfers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.transfer.count({ where: { expiresAt: { gt: now } } }),
      prisma.transfer.count({ where: { expiresAt: { lte: now } } }),
      prisma.downloadLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.transfer.aggregate({ _sum: { totalSize: true }, where: { expiresAt: { gt: now } } }),
      prisma.transfer.findMany({
        where: { expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { files: { select: { id: true } }, user: { select: { username: true } } },
      }),
    ])

    // Downloads per day (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      return d
    }).reverse()

    const downloadHistory = await Promise.all(
      last7Days.map(async (day) => {
        const next = new Date(day)
        next.setDate(next.getDate() + 1)
        const count = await prisma.downloadLog.count({
          where: { createdAt: { gte: day, lt: next } },
        })
        return { date: day.toISOString().split('T')[0], count }
      })
    )

    res.json({
      totalUsers,
      activeTransfers,
      expiredTransfers,
      downloadsToday,
      storageUsedBytes: (storageResult._sum.totalSize ?? BigInt(0)).toString(),
      downloadHistory,
      recentTransfers: recentTransfers.map((t) => ({
        shortId: t.shortId,
        title: t.title,
        encrypted: t.encrypted,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        totalSize: t.totalSize.toString(),
        downloadCount: t.downloadCount,
        fileCount: t.files.length,
        uploaderUsername: t.user?.username ?? null,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// List all transfers
router.get('/transfers', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 20
    const skip = (page - 1) * limit
    const search = req.query.search as string | undefined
    const status = req.query.status as string | undefined

    const now = new Date()
    const where: any = {}
    if (search) where.OR = [{ shortId: { contains: search } }, { title: { contains: search, mode: 'insensitive' } }]
    if (status === 'active') where.expiresAt = { gt: now }
    if (status === 'expired') where.expiresAt = { lte: now }

    const [transfers, total] = await Promise.all([
      prisma.transfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          files: { select: { id: true } },
          user: { select: { username: true, email: true } },
        },
      }),
      prisma.transfer.count({ where }),
    ])

    res.json({
      transfers: transfers.map((t) => ({
        shortId: t.shortId,
        title: t.title,
        encrypted: t.encrypted,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        totalSize: t.totalSize.toString(),
        downloadCount: t.downloadCount,
        fileCount: t.files.length,
        passwordProtected: !!t.passwordHash,
        uploaderUsername: t.user?.username ?? null,
        uploaderEmail: t.user?.email ?? null,
        expired: t.expiresAt <= now,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (err) {
    next(err)
  }
})

// Delete a transfer (admin)
router.delete('/transfers/:shortId', async (req, res, next) => {
  try {
    const transfer = await prisma.transfer.findUnique({
      where: { shortId: req.params.shortId },
      include: { files: true },
    })
    if (!transfer) throw new AppError('Transfer not found', 404)

    await deleteObjects(transfer.files.map((f) => f.storageKey))

    if (transfer.userId) {
      await prisma.user.update({
        where: { id: transfer.userId },
        data: { storageUsed: { decrement: transfer.totalSize } },
      })
    }

    await prisma.transfer.delete({ where: { id: transfer.id } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// Live stats: active sessions, visitors, upload map
router.get('/live-stats', async (req, res, next) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [visitorsResult, uploadLogRows] = await Promise.all([
      prisma.log.findMany({
        where: { createdAt: { gte: fiveMinAgo }, ip: { not: null } },
        select: { ip: true },
        distinct: ['ip'],
      }),
      prisma.log.findMany({
        where: { category: 'upload', createdAt: { gte: thirtyDaysAgo }, ip: { not: null } },
        select: { ip: true },
      }),
    ])

    // Geolocate upload IPs and cluster by rounded lat/lon
    const clusters = new Map<string, { lat: number; lon: number; city: string; country: string; count: number }>()
    for (const row of uploadLogRows) {
      const ip = (row.ip || '').replace(/^::ffff:/, '')
      const geo = geoip.lookup(ip)
      if (!geo?.ll) continue
      const key = `${geo.ll[0].toFixed(1)},${geo.ll[1].toFixed(1)}`
      const existing = clusters.get(key)
      if (existing) {
        existing.count++
      } else {
        clusters.set(key, { lat: geo.ll[0], lon: geo.ll[1], city: geo.city || '', country: geo.country || '', count: 1 })
      }
    }

    res.json({
      activeUploads: uploadSessions.size,
      activeDownloads: getActiveDownloads(),
      visitorsOnline: visitorsResult.length,
      uploadLocations: Array.from(clusters.values()),
    })
  } catch (err) {
    next(err)
  }
})

// List all users
router.get('/users', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 20
    const skip = (page - 1) * limit

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          storageUsed: true,
          createdAt: true,
          _count: { select: { transfers: true } },
        },
      }),
      prisma.user.count(),
    ])

    res.json({
      users: users.map((u) => ({
        ...u,
        storageUsed: u.storageUsed.toString(),
        transferCount: u._count.transfers,
        _count: undefined,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (err) {
    next(err)
  }
})

// Update user role
router.put('/users/:id', async (req, res, next) => {
  try {
    const { role } = req.body
    if (!['USER', 'ADMIN'].includes(role)) throw new AppError('Invalid role', 400)

    const user = await prisma.user.update({
      where: { id: req.params.id },
      // Bumping tokenVersion invalidates any JWT already issued to this user,
      // so a role change takes effect immediately instead of after up to 7 days.
      data: { role, tokenVersion: { increment: 1 } },
      select: { id: true, email: true, username: true, role: true },
    })
    res.json({ user })
  } catch (err) {
    next(err)
  }
})

// Return diagnostic token (admin only)
router.get('/diag-token', (req, res) => {
  res.json({ token: DIAG_TOKEN })
})

// List logs
router.get('/logs', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 50
    const skip = (page - 1) * limit
    const level = req.query.level as string | undefined
    const category = req.query.category as string | undefined
    const search = req.query.search as string | undefined

    const where: any = {}
    if (level && level !== 'all') where.level = level
    if (category && category !== 'all') where.category = category
    if (search) where.message = { contains: search, mode: 'insensitive' }

    const [logs, total] = await Promise.all([
      prisma.log.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.log.count({ where }),
    ])

    res.json({ logs, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
})

// Delete user
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) throw new AppError('Cannot delete yourself', 400)
    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export { router as adminRouter }
