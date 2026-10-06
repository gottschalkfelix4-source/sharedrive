import { z } from 'zod'
import mapping from './environmentSettings.json'
import { DEFAULT_SETTINGS } from './settingsDefaults'
import { validateSettingUpdates, validateSettingValue } from './settingsValidation'
import { AppError } from '../middleware/errorHandler'

export const SECRET_SETTING_KEYS = ['email.password', 'storage.s3SecretKey']
export const MASKED_SETTING = '\u2022'.repeat(8)

export function readEnvironmentSettings(
  environment: NodeJS.ProcessEnv
): Readonly<Record<string, string>> {
  const settings: Record<string, string> = {}
  for (const { key, env, multiplier } of mapping) {
    const raw = environment[env]
    if (raw === undefined || raw === '') continue
    try {
      let value = raw
      if (multiplier) {
        if (!/^\d+$/.test(raw)) throw new Error('Invalid size')
        const converted = Number(raw) * multiplier
        if (!Number.isSafeInteger(converted)) throw new Error('Invalid size')
        value = String(converted)
      }
      validateSettingValue(key, value)
      settings[key] = value
    } catch {
      // Startup errors identify the field, never the supplied value or secret.
      throw new Error(`Invalid environment setting: ${env}`)
    }
  }
  return Object.freeze(settings)
}

// Capture once: deployment settings cannot change underneath a running request.
export const environmentSettings = readEnvironmentSettings(process.env)
export const managedSettingKeys = Object.freeze(Object.keys(environmentSettings))

export function applyEnvironmentSettings(
  settings: Record<string, string>,
  overrides: Readonly<Record<string, string>> = environmentSettings
): Record<string, string> {
  return { ...settings, ...overrides }
}

export function maskSecretSettings(settings: Record<string, string>): Record<string, string> {
  const safe = { ...settings }
  for (const key of SECRET_SETTING_KEYS)
    if (safe[key]) safe[key] = MASKED_SETTING
  return safe
}

export function prepareSettingUpdates(
  input: unknown,
  current: Record<string, string>,
  overrides: Readonly<Record<string, string>> = environmentSettings
): Record<string, string> {
  const submitted = z.record(z.string()).parse(input)
  const effective = applyEnvironmentSettings({ ...DEFAULT_SETTINGS, ...current }, overrides)
  const writable: Record<string, string> = {}
  for (const [key, value] of Object.entries(submitted)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key))
      throw new AppError('Unknown setting', 400)
    const masked = SECRET_SETTING_KEYS.includes(key) && value === MASKED_SETTING
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      if (value !== effective[key] && !masked)
        throw new AppError(`Setting ${key} is managed by the deployment environment`, 400)
      continue
    }
    if (!masked) writable[key] = value
  }
  return validateSettingUpdates(writable, effective)
}
