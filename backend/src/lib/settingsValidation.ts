import { z } from 'zod'
import { AppError } from '../middleware/errorHandler'
import { DEFAULT_SETTINGS } from '../routes/settings'
const bool = z.enum(['true', 'false'])
const integer = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .refine(
      (v) =>
        Number.isSafeInteger(Number(v)) && Number(v) >= min && Number(v) <= max,
      'Invalid numeric setting'
    )
const url = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v)
    return (
      ['http:', 'https:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/'
    )
  }, 'Invalid application URL')
const schemas: Record<string, z.ZodTypeAny> = {
  'app.name': z.string().min(1).max(100),
  'app.description': z.string().max(500),
  'app.baseUrl': url,
  'app.maxFilesPerTransfer': integer(1, 1000),
  'storage.maxFileSizeBytes': integer(1, 80 * 1024 ** 3),
  'storage.maxTransferSizeBytes': integer(1, 80 * 1024 ** 3),
  'storage.userStorageQuotaBytes': integer(0, Number.MAX_SAFE_INTEGER),
  'storage.retentionDaysAnonymous': integer(1, 365),
  'storage.retentionDaysRegistered': integer(1, 365),
  'email.enabled': bool,
  'email.secure': bool,
  'email.port': integer(1, 65535),
  'email.host': z
    .string()
    .max(253)
    .refine((v) => !/[\s/\\\x00]/.test(v)),
  'email.from': z.string().email(),
  'email.user': z.string().max(254),
  'email.password': z.string().max(1024),
  'security.registrationEnabled': bool,
  'security.requireEmailVerification': bool,
  'security.virusScanEnabled': bool,
  'appearance.primaryColor': z.string().regex(/^#[0-9a-f]{6}$/i),
  'privacy.logRetentionDays': integer(1, 365),
  'legal.privacyPolicy': z.string().max(100000),
  'legal.imprint': z.string().max(100000),
  'appearance.logoUrl': z
    .string()
    .max(2048)
    .refine((v) => !v || v.startsWith('/api/assets/') || /^https:\/\//.test(v)),
  'appearance.faviconUrl': z
    .string()
    .max(2048)
    .refine((v) => !v || v.startsWith('/api/assets/') || /^https:\/\//.test(v)),
}
export function validateSettingUpdates(
  input: unknown,
  current: Record<string, string>
): Record<string, string> {
  const updates = z.record(z.string()).parse(input)
  for (const [key, value] of Object.entries(updates)) {
    if (!(key in DEFAULT_SETTINGS)) throw new AppError('Unknown setting', 400)
    // Existing S3 configuration remains outside this change's scope.
    if (key.startsWith('storage.s3')) continue
    if (!schemas[key]) throw new AppError('Unsupported setting', 400)
    schemas[key].parse(value)
  }
  const merged = { ...current, ...updates }
  if (
    Number(merged['storage.maxFileSizeBytes']) >
    Number(merged['storage.maxTransferSizeBytes'])
  )
    throw new AppError('File limit cannot exceed transfer limit', 400)
  if (
    merged['security.requireEmailVerification'] === 'true' &&
    merged['email.enabled'] !== 'true'
  )
    throw new AppError('Email verification requires enabled SMTP', 400)
  return updates
}
