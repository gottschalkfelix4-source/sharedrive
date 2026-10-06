import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import mapping from '../src/lib/environmentSettings.json'
import { DEFAULT_SETTINGS } from '../src/lib/settingsDefaults'
import {
  applyEnvironmentSettings,
  MASKED_SETTING,
  maskSecretSettings,
  prepareSettingUpdates,
  readEnvironmentSettings,
} from '../src/lib/environmentSettings'
import { validateSettingUpdates } from '../src/lib/settingsValidation'

test('deployment mapping covers every configurable setting exactly once', () => {
  assert.deepEqual(mapping.map((item) => item.key).sort(), Object.keys(DEFAULT_SETTINGS).sort())
  assert.equal(new Set(mapping.map((item) => item.env)).size, mapping.length)
  assert.ok(mapping.every((item) => /^SHAREDRIVE_[A-Z0-9_]+$/.test(item.env)))
})

test('empty variables remain database-managed while MiB values convert exactly', () => {
  const overrides = readEnvironmentSettings({
    SHAREDRIVE_APP_NAME: '',
    SHAREDRIVE_MAX_FILE_SIZE_MIB: '1',
    SHAREDRIVE_MAX_TRANSFER_SIZE_MIB: '81920',
    SHAREDRIVE_USER_STORAGE_QUOTA_MIB: '0',
    SHAREDRIVE_REGISTRATION_ENABLED: 'false',
  })
  assert.deepEqual(overrides, {
    'storage.maxFileSizeBytes': '1048576',
    'storage.maxTransferSizeBytes': '85899345920',
    'storage.userStorageQuotaBytes': '0',
    'security.registrationEnabled': 'false',
  })
  assert.equal(Object.isFrozen(overrides), true)
  const saved = { ...DEFAULT_SETTINGS, 'app.name': 'Saved name' }
  const effective = applyEnvironmentSettings(saved, overrides)
  assert.equal(effective['app.name'], 'Saved name')
  assert.equal(effective['storage.maxFileSizeBytes'], '1048576')
  assert.equal(saved['storage.maxFileSizeBytes'], DEFAULT_SETTINGS['storage.maxFileSizeBytes'])
  assert.deepEqual(applyEnvironmentSettings(saved, {}), saved)
})

test('invalid deployment values fail without echoing supplied values or secrets', () => {
  for (const environment of [
    { SHAREDRIVE_MAX_FILE_SIZE_MIB: '0' },
    { SHAREDRIVE_MAX_FILE_SIZE_MIB: '1.5' },
    { SHAREDRIVE_MAX_TRANSFER_SIZE_MIB: '81921' },
    { SHAREDRIVE_USER_STORAGE_QUOTA_MIB: '9999999999999999999' },
    { SHAREDRIVE_REGISTRATION_ENABLED: 'yes' },
    { SHAREDRIVE_S3_ENDPOINT: 'https://example.com/path' },
    { SHAREDRIVE_SMTP_PASSWORD: 'private-fixture'.repeat(100) },
  ]) {
    const variable = Object.keys(environment)[0]
    assert.throws(() => readEnvironmentSettings(environment), (error: Error) => {
      assert.equal(error.message, `Invalid environment setting: ${variable}`)
      assert.doesNotMatch(error.message, /private-fixture/)
      return true
    })
  }
})

test('managed unchanged settings and masked credentials never write environment values to the database', () => {
  const saved = { ...DEFAULT_SETTINGS, 'app.name': 'Database name', 'email.password': 'database-secret' }
  const overrides = readEnvironmentSettings({
    SHAREDRIVE_APP_NAME: 'Environment name',
    SHAREDRIVE_SMTP_PASSWORD: 'environment-secret',
    SHAREDRIVE_S3_SECRET_KEY: 'environment-s3-secret',
  })
  assert.deepEqual(prepareSettingUpdates({
    'app.name': 'Environment name',
    'email.password': MASKED_SETTING,
    'storage.s3SecretKey': MASKED_SETTING,
    'app.description': 'Writable description',
  }, saved, overrides), { 'app.description': 'Writable description' })
  assert.deepEqual(prepareSettingUpdates({ 'email.password': 'environment-secret' }, saved, overrides), {})
  for (const updates of [
    { 'app.name': 'Different name' },
    { 'email.password': 'different-secret' },
    { 'email.password': '' },
    { 'storage.s3SecretKey': 'different-secret' },
  ]) assert.throws(() => prepareSettingUpdates(updates, saved, overrides), /managed by the deployment environment/)
  assert.equal(saved['app.name'], 'Database name')
  assert.equal(saved['email.password'], 'database-secret')
})

test('masking preserves both unmanaged and managed credentials without returning their content', () => {
  const settings = { ...DEFAULT_SETTINGS, 'email.password': 'mail-secret', 'storage.s3SecretKey': 's3-secret' }
  const safe = maskSecretSettings(settings)
  assert.equal(safe['email.password'], MASKED_SETTING)
  assert.equal(safe['storage.s3SecretKey'], MASKED_SETTING)
  assert.equal(settings['email.password'], 'mail-secret')
  assert.deepEqual(prepareSettingUpdates(safe, settings, {}), Object.fromEntries(
    Object.entries(settings).filter(([key]) => !['email.password', 'storage.s3SecretKey'].includes(key))
  ))
})

test('writes validate limits and related settings against effective deployment values', () => {
  const overrides = readEnvironmentSettings({ SHAREDRIVE_MAX_FILE_SIZE_MIB: '2' })
  assert.throws(() => prepareSettingUpdates({ 'storage.maxTransferSizeBytes': '1048576' }, DEFAULT_SETTINGS, overrides), /File limit/)
  assert.throws(() => prepareSettingUpdates({}, DEFAULT_SETTINGS,
    readEnvironmentSettings({ SHAREDRIVE_REQUIRE_EMAIL_VERIFICATION: 'true' })), /enabled SMTP/)
  assert.throws(() => prepareSettingUpdates({}, DEFAULT_SETTINGS,
    readEnvironmentSettings({ SHAREDRIVE_SMTP_ENABLED: 'true' })), /requires a host/)
  assert.throws(() => prepareSettingUpdates({}, DEFAULT_SETTINGS,
    readEnvironmentSettings({ SHAREDRIVE_S3_ENABLED: 'true' })), /requires endpoint/)
})

test('S3 settings reject unsafe shapes, invalid booleans, ports and incomplete credentials', () => {
  for (const updates of [
    { 'storage.s3Enabled': 'yes' },
    { 'storage.s3Endpoint': 'user:password@example.com' },
    { 'storage.s3Endpoint': 'example.com/path' },
    { 'storage.s3Endpoint': 'bad host' },
    { 'storage.s3Port': '0' },
    { 'storage.s3Port': '65536' },
    { 'storage.s3UseSSL': '1' },
    { 'storage.s3Bucket': '../bucket' },
    { 'storage.s3AccessKey': 'a\nb' },
    { 'storage.s3SecretKey': 'a\nb' },
    { 'storage.s3Enabled': 'true' },
  ]) assert.throws(() => validateSettingUpdates(updates, DEFAULT_SETTINGS))
  assert.doesNotThrow(() => validateSettingUpdates({
    'storage.s3Enabled': 'true',
    'storage.s3Endpoint': 's3.internal.example',
    'storage.s3Bucket': 'sharedrive-data',
    'storage.s3AccessKey': 'fixture-access',
    'storage.s3SecretKey': 'fixture-secret',
  }, DEFAULT_SETTINGS))
  assert.doesNotThrow(() => validateSettingUpdates({ 'storage.s3Endpoint': '::1' }, DEFAULT_SETTINGS))
})

test('process environment overrides are captured once and invalid values fail at import', () => {
  const script = `
    const assert = require('node:assert/strict');
    const settings = require('./src/lib/environmentSettings.ts');
    assert.equal(settings.environmentSettings['app.name'], 'captured');
    process.env.SHAREDRIVE_APP_NAME = 'changed';
    assert.equal(settings.environmentSettings['app.name'], 'captured');
    assert.deepEqual(settings.managedSettingKeys, ['app.name']);
  `
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SHAREDRIVE_')))
  const valid = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: process.cwd(), env: { ...environment, SHAREDRIVE_APP_NAME: 'captured' }, encoding: 'utf8',
  })
  assert.equal(valid.status, 0, valid.stderr)
  const invalid = spawnSync(process.execPath, ['--import', 'tsx', '-e', "require('./src/lib/environmentSettings.ts')"], {
    cwd: process.cwd(), env: { ...environment, SHAREDRIVE_S3_SECRET_KEY: 'private-fixture\ninvalid' }, encoding: 'utf8',
  })
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stderr, /Invalid environment setting: SHAREDRIVE_S3_SECRET_KEY/)
  assert.doesNotMatch(invalid.stderr, /private-fixture/)
})
