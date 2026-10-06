import { z } from 'zod'
import { AppError } from '../middleware/errorHandler'

export const CHUNK_SIZE = 8 * 1024 * 1024
export const ENC_OVERHEAD = 28
const size = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const uploadSchema = z
  .object({
    title: z.string().max(4096).optional(),
    message: z.string().max(8192).optional(),
    password: z.string().max(256).optional(),
    notifyEmail: z.string().email().max(254).optional(),
    expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
    maxDownloads: z.coerce.number().int().min(1).max(100000).optional(),
    encrypted: z.boolean().default(false),
    encryptionVersion: z.union([z.literal(1), z.literal(2)]).default(1),
    encryptionContext: z.string().uuid().optional(),
    encryptedManifest: z.string().min(1).max(500000).optional(),
    files: z
      .array(
        z.object({
          name: z.string().min(1).max(4096),
          relativePath: z.string().max(8192).optional(),
          size,
          mimeType: z.string().max(255).default('application/octet-stream'),
        })
      )
      .min(1)
      .max(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.encrypted &&
      v.encryptionVersion === 2 &&
      (!v.encryptionContext || !v.encryptedManifest)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Encryption context and manifest required',
      })
    }
  })
export function validateLimits(
  files: { size: number }[],
  settings: Record<string, string>
): number {
  const total = files.reduce((n, f) => n + f.size, 0)
  if (!Number.isSafeInteger(total))
    throw new AppError('Invalid total size', 400)
  if (files.length > Number(settings['app.maxFilesPerTransfer']))
    throw new AppError('Too many files', 413)
  if (files.some((f) => f.size > Number(settings['storage.maxFileSizeBytes'])))
    throw new AppError('File size exceeds limit', 413)
  if (total > Number(settings['storage.maxTransferSizeBytes']))
    throw new AppError('Transfer size exceeds limit', 413)
  return total
}
export function expectedPartSize(
  size: number,
  encrypted: boolean,
  part: number
): number {
  const count = Math.max(1, Math.ceil(size / CHUNK_SIZE))
  if (!Number.isInteger(part) || part < 1 || part > count || count > 10000)
    throw new AppError('Invalid part number', 400)
  return (
    Math.min(CHUNK_SIZE, Math.max(0, size - (part - 1) * CHUNK_SIZE)) +
    (encrypted ? ENC_OVERHEAD : 0)
  )
}
export function storedSize(size: number, encrypted: boolean): number {
  return (
    size +
    (encrypted ? Math.max(1, Math.ceil(size / CHUNK_SIZE)) * ENC_OVERHEAD : 0)
  )
}
export function safeArchivePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((x) => x === '..') ||
    /[\x00-\x1f]/.test(normalized)
  ) {
    throw new AppError('Invalid file path', 400)
  }
  return normalized
}
