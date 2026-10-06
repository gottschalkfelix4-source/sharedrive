import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  uploadSchema,
  expectedPartSize,
  storedSize,
  safeArchivePath,
  CHUNK_SIZE,
  validateLimits,
} from '../src/lib/uploadValidation'
import { validateSettingUpdates } from '../src/lib/settingsValidation'
import { DEFAULT_SETTINGS } from '../src/routes/settings'
import { anonymizeIp } from '../src/services/logger'

test('untrusted upload metadata rejects invalid sizes, unexpected fields and missing encryption context', () => {
  for (const size of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => uploadSchema.parse({ files: [{ name: 'a', size }] }))
  assert.throws(() =>
    uploadSchema.parse({
      files: [{ name: 'a', size: 1 }],
      encrypted: true,
      encryptionVersion: 2,
    })
  )
  assert.throws(() =>
    uploadSchema.parse({
      files: [{ name: 'a', size: 1 }],
      userId: 'someone-else',
    })
  )
  assert.equal(
    uploadSchema.parse({ files: [{ name: 'empty', size: 0 }] }).files[0].size,
    0
  )
})
test('chunk framing accounts for partial, empty and encrypted files', () => {
  assert.equal(expectedPartSize(CHUNK_SIZE + 2, false, 2), 2)
  assert.equal(expectedPartSize(CHUNK_SIZE + 2, true, 2), 30)
  assert.equal(storedSize(0, true), 28)
  assert.equal(expectedPartSize(0, false, 1), 0)
  for (const part of [0, -1, 0.5, 3])
    assert.throws(() => expectedPartSize(CHUNK_SIZE + 2, false, part))
  assert.throws(() => expectedPartSize(CHUNK_SIZE * 10001, false, 1))
})
test('transfer limits and archive paths fail closed', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    'storage.maxFileSizeBytes': '5',
    'storage.maxTransferSizeBytes': '8',
    'app.maxFilesPerTransfer': '2',
  }
  assert.equal(validateLimits([{ size: 5 }, { size: 3 }], settings), 8)
  for (const files of [
    [{ size: 6 }],
    [{ size: 5 }, { size: 4 }],
    [{ size: 1 }, { size: 1 }, { size: 1 }],
  ])
    assert.throws(() => validateLimits(files, settings))
  for (const name of ['../a', 'folder/../../a', '/a', 'C:\\a', 'a\u0000b'])
    assert.throws(() => safeArchivePath(name))
  assert.equal(safeArchivePath('folder\\name.txt'), 'folder/name.txt')
})
test('settings validation rejects unknown keys, inconsistent limits and unsafe URLs', () => {
  for (const updates of [
    { 'setup.credentialsPending': 'x' },
    { 'privacy.logRetentionDays': 'NaN' },
    { 'app.baseUrl': 'javascript:alert(1)' },
    { 'app.baseUrl': 'https://user:pass@example.com' },
    { 'app.baseUrl': 'https://share.example.com/subpath' },
    { 'storage.maxFileSizeBytes': '20000000000' },
    { 'security.requireEmailVerification': 'true' },
  ])
    assert.throws(() => validateSettingUpdates(updates, DEFAULT_SETTINGS))
  assert.deepEqual(
    validateSettingUpdates({ 'app.name': 'New name' }, DEFAULT_SETTINGS),
    { 'app.name': 'New name' }
  )
})
test('IP anonymization handles compressed IPv6, mapped IPv4 and invalid addresses', () => {
  assert.equal(anonymizeIp('192.168.1.42'), '192.168.1.0')
  assert.equal(anonymizeIp('::ffff:192.168.1.42'), '192.168.1.0')
  assert.equal(anonymizeIp('2001:db8::1'), '2001:db8:0::')
  assert.equal(anonymizeIp('::1'), '0:0:0::')
  assert.equal(anonymizeIp('invalid'), '')
})
