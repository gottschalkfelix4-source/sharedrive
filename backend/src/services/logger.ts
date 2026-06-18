import { prisma } from '../lib/prisma'

export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'upload' | 'auth' | 'download' | 'system' | 'error'

interface LogMeta {
  userId?: string
  ip?: string
  [key: string]: unknown
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
        ip: ip ?? null,
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
