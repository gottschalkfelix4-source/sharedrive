import { z } from 'zod'
import { isIP } from 'node:net'
import { AppError } from '../middleware/errorHandler'
import { DEFAULT_SETTINGS } from './settingsDefaults'
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
  'storage.s3Enabled': bool,
  'storage.s3Endpoint': z.string().max(253).refine(
    (v) => !v || isIP(v) !== 0 || /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(v),
    'S3 endpoint must be a hostname without a URL scheme or path'
  ),
  'storage.s3Port': integer(1, 65535),
  'storage.s3UseSSL': bool,
  'storage.s3Region': z.string().max(100).regex(/^[a-z0-9-]*$/i),
  'storage.s3Bucket': z.string().max(63).refine(
    (v) => !v || /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(v),
    'Invalid S3 bucket name'
  ),
  'storage.s3AccessKey': z.string().max(1024).refine((v) => !/[\s\x00]/.test(v)),
  'storage.s3SecretKey': z.string().max(1024).refine((v) => !/[\x00\r\n]/.test(v)),
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
export function validateSettingValue(key: string, value: string): void {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key))
    throw new AppError('Unknown setting', 400)
  if (!schemas[key]) throw new AppError('Unsupported setting', 400)
  schemas[key].parse(value)
}

export function validateEffectiveSettings(settings: Record<string, string>): void {
  for (const key of Object.keys(DEFAULT_SETTINGS))
    validateSettingValue(key, settings[key])
  if (
    Number(settings['storage.maxFileSizeBytes']) >
    Number(settings['storage.maxTransferSizeBytes'])
  )
    throw new AppError('File limit cannot exceed transfer limit', 400)
  if (
    settings['security.requireEmailVerification'] === 'true' &&
    settings['email.enabled'] !== 'true'
  )
    throw new AppError('Email verification requires enabled SMTP', 400)
  if (settings['email.enabled'] === 'true' && !settings['email.host'])
    throw new AppError('Enabled SMTP requires a host', 400)
  if (settings['storage.s3Enabled'] === 'true' && [
    'storage.s3Endpoint', 'storage.s3Bucket', 'storage.s3AccessKey', 'storage.s3SecretKey',
  ].some((key) => !settings[key]))
    throw new AppError('Enabled S3 requires endpoint, bucket and credentials', 400)
}

export function validateSettingUpdates(
  input: unknown,
  current: Record<string, string>
): Record<string, string> {
  const updates = z.record(z.string()).parse(input)
  for (const [key, value] of Object.entries(updates)) {
    validateSettingValue(key, value)
  }
  const merged = { ...current, ...updates }
  validateEffectiveSettings(merged)
  return updates
}
