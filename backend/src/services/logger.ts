import { isIP } from 'net'
import { prisma } from '../lib/prisma'

export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory =
  | 'upload'
  | 'auth'
  | 'download'
  | 'system'
  | 'error'
  | 'security'

interface LogMeta {
  userId?: string
  ip?: string
  [key: string]: unknown
}

// DSGVO: anonymize IP before storage.
// IPv4  → last octet zeroed   (1.2.3.4 → 1.2.3.0)
// IPv6  → /48 prefix kept     (2001:db8:85a3::1 → 2001:db8:85a3::)
// ::ffff:x.x.x.x (mapped v4) → ::ffff:x.x.x.0
export function anonymizeIp(input: string): string {
  const ip = input.split('%')[0]
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return anonymizeIp(mapped[1])
  if (isIP(ip) === 4) return ip.split('.').slice(0, 3).join('.') + '.0'
  if (isIP(ip) !== 6) return ''
  const [left, right] = ip.split('::')
  const a = left ? left.split(':') : [],
    b = right ? right.split(':') : []
  const full =
    right === undefined
      ? a
      : [...a, ...Array(8 - a.length - b.length).fill('0'), ...b]
  return (
    full
      .slice(0, 3)
      .map((v) => parseInt(v, 16).toString(16))
      .join(':') + '::'
  )
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
        ip: ip ? anonymizeIp(ip) : null,
        meta:
          extraKeys.length > 0
            ? (rest as Record<string, string | number | boolean | null>)
            : undefined,
      },
    })
  } catch {
    // Never crash the app if logging fails
  }
}

export async function cleanOldLogs(retentionDays = 30): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  await prisma.$transaction([
    prisma.log.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.downloadLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ])
}
