import { prisma } from '../lib/prisma'

export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'upload' | 'auth' | 'download' | 'system' | 'error' | 'security'

interface LogMeta {
  userId?: string
  ip?: string
  [key: string]: unknown
}

// DSGVO: anonymize IP before storage.
// IPv4  → last octet zeroed   (1.2.3.4 → 1.2.3.0)
// IPv6  → /48 prefix kept     (2001:db8:85a3::1 → 2001:db8:85a3::)
// ::ffff:x.x.x.x (mapped v4) → ::ffff:x.x.x.0
export function anonymizeIp(ip: string): string {
  if (!ip) return ''

  // IPv4-mapped IPv6 — e.g. ::ffff:192.168.1.4
  const mapped = ip.match(/^(::ffff:)(\d+\.\d+\.\d+)\.\d+$/i)
  if (mapped) return `${mapped[1]}${mapped[2]}.0`

  // Plain IPv4
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/)
  if (v4) return `${v4[1]}.0`

  // IPv6: keep only the first 3 groups (48-bit prefix, DSGVO standard)
  if (ip.includes(':')) {
    const groups = ip.split(':')
    if (groups.length >= 4) return groups.slice(0, 3).join(':') + '::'
  }

  return ip
}

export async function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: LogMeta
): Promise<void> {
  const { userId, ip, ...rest } = meta ?? {}
  const extraKeys = Object.keys(rest)
  try {
    await prisma.log.create({
      data: {
        level,
        category,
        message,
        userId: userId ?? null,
        ip:     ip ? anonymizeIp(ip) : null,
        meta: extraKeys.length > 0 ? (rest as Record<string, string | number | boolean | null>) : undefined,
      },
    })
  } catch {
    // Never crash the app if logging fails
  }
}

export async function cleanOldLogs(retentionDays = 30): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  await prisma.log.deleteMany({ where: { createdAt: { lt: cutoff } } })
}
