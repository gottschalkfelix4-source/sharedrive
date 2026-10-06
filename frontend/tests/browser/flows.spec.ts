import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import {
  generateKey,
  exportKey,
  encryptText,
  metadataAAD,
  encryptionManifest,
} from '../../src/lib/e2e'
import { test, expect } from '@playwright/test'

const server = createServer((req, res) => {
  const url = new URL(req.url!, 'http://localhost')
  if (url.searchParams.get('ticket') !== 'fixture-ticket') {
    res.writeHead(401)
    res.end()
    return
  }
  const zip = url.pathname.endsWith('/zip')
  res.writeHead(200, {
    'content-type': zip ? 'application/zip' : 'application/octet-stream',
    'content-disposition': `attachment; filename="${zip ? 'fixture.zip' : 'fixture.txt'}"`,
  })
  res.end(zip ? 'PKfixture' : 'abc')
})
test.beforeAll(async () => {
  await new Promise<void>((resolve) =>
    server.listen(39005, '127.0.0.1', resolve)
  )
})
test.afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/setup/status', (r) =>
    r.fulfill({ json: { needsSetup: false } })
  )
  await page.route('**/api/settings/public', (r) =>
    r.fulfill({
      json: {
        appName: 'ShareDrive',
        registrationEnabled: true,
        maxFileSizeBytes: 1000000,
        maxTransferSizeBytes: 1000000,
        primaryColor: '#6366f1',
        logoUrl: '',
        faviconUrl: '',
      },
    })
  )
  await page.route('**/api/settings/disk-stats', (r) =>
    r.fulfill({
      json: { used: '0', nextExpiryAt: null, source: 'transfer-accounting' },
    })
  )
})

test('wrong password remains editable; individual and ZIP downloads request scoped tickets', async ({
  page,
}) => {
  const file = {
    id: 'fixture-file',
    name: 'fixture.txt',
    size: '3',
    mimeType: 'text/plain',
  }
  await page.route('**/api/d/protected', (r) =>
    r.request().headers()['x-transfer-password'] === 'correct'
      ? r.fulfill({
          json: {
            shortId: 'protected',
            title: 'Fixture',
            files: [file, { ...file, id: 'fixture-two', name: 'second.txt' }],
            totalSize: '3',
            expiresAt: '2099-01-01',
            encrypted: false,
            virusScanned: false,
            passwordProtected: true,
            downloadCount: 0,
          },
        })
      : r.fulfill({
          status: 401,
          json: { error: 'Password required or invalid' },
        })
  )
  const scopes: (string | undefined)[] = []
  await page.route('**/api/d/protected/ticket', (r) => {
    expect(r.request().headers()['x-transfer-password']).toBe('correct')
    scopes.push(r.request().postDataJSON().fileId)
    return r.fulfill({ json: { ticket: 'fixture-ticket' } })
  })
  await page.goto('/d/protected')
  await page.getByPlaceholder('Passwort', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: 'Transfer entsperren' }).click()
  await expect(
    page.getByText('Passwort ungültig. Bitte erneut versuchen.')
  ).toBeVisible()
  await page.getByPlaceholder('Passwort', { exact: true }).fill('correct')
  await page.getByRole('button', { name: 'Transfer entsperren' }).click()
  await expect(page.getByText('fixture.txt')).toBeVisible()
  const fileDownload = page.waitForEvent('download')
  await page
    .getByRole('button', { name: /Herunterladen/ })
    .first()
    .click()
  expect(
    (await readFile((await (await fileDownload).path())!)).toString()
  ).toBe('abc')
  const zipDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /ZIP/ }).click()
  expect((await readFile((await (await zipDownload).path())!)).toString()).toBe(
    'PKfixture'
  )
  expect(scopes).toEqual(['fixture-file', undefined])
})

test('encrypted upload preserves key, version and context in the open-download link', async ({
  page,
}) => {
  let metadata: any,
    partAttempts = 0
  await page.route('**/api/transfers/chunked/init', (r) => {
    metadata = r.request().postDataJSON()
    return r.fulfill({
      status: 201,
      json: { shortId: 'encrypted', fileTokens: ['fixture-token'] },
    })
  })
  await page.route('**/api/transfers/chunked/encrypted/part', (r) => {
    expect(r.request().postDataBuffer()!.length).toBe(31)
    if (partAttempts++ === 0)
      return r.fulfill({
        status: 503,
        json: { error: 'Transient fixture failure' },
      })
    return r.fulfill({ json: { part: 1, etag: 'fixture' } })
  })
  await page.route('**/api/transfers/chunked/encrypted/finalize', (r) =>
    r.fulfill({
      status: 201,
      json: {
        shortId: 'encrypted',
        totalSize: '3',
        fileCount: 1,
        expiresAt: '2099-01-01',
        virusScanned: false,
      },
    })
  )
  await page.goto('/')
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'secret.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('abc'),
    })
  await page.getByRole('switch').first().click()
  await page
    .getByRole('button', { name: /Upload starten|Dateien teilen|Hochladen/ })
    .click()
  const link = page.getByRole('link', { name: /Download-Seite öffnen/ })
  await expect(link).toBeVisible()
  const href = await link.getAttribute('href'),
    url = new URL(href!, 'http://127.0.0.1:5176')
  const fragment = new URLSearchParams(url.hash.slice(1))
  expect(fragment.get('key')).toHaveLength(43)
  expect(fragment.get('v')).toBe('2')
  expect(fragment.get('context')).toBe(metadata.encryptionContext)
  expect(metadata.files[0].name).not.toBe('secret.txt')
  expect(partAttempts).toBe(2)
})

test('uploads can be cancelled while requests are in flight', async ({
  page,
}) => {
  await page.route('**/api/transfers/chunked/init', (r) =>
    r.fulfill({
      status: 201,
      json: { shortId: 'cancel', fileTokens: ['cancel-token'] },
    })
  )
  await page.route('**/api/transfers/chunked/cancel/part', () => {})
  await page.route('**/api/transfers/chunked/cancel', (r) => {
    expect(r.request().headers()['x-file-token']).toBe('cancel-token')
    return r.fulfill({ json: { ok: true } })
  })
  await page.goto('/')
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'cancel.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('abc'),
    })
  await page
    .getByRole('button', { name: /Upload starten|Dateien teilen|Hochladen/ })
    .click()
  await page.getByRole('button', { name: 'Upload abbrechen' }).click()
  await expect(page.getByText('Upload abgebrochen')).toBeVisible()
  await expect(page.getByText('cancel.txt')).toBeVisible()
})

test('an authenticated manifest detects omitted files and blocks downloads', async ({
  page,
}) => {
  const context = crypto.randomUUID(),
    key = await generateKey(),
    raw = await exportKey(key)
  const plaintext = {
    title: null,
    message: null,
    files: [
      {
        index: 0,
        name: 'first.txt',
        path: null,
        size: 3,
        mimeType: 'text/plain',
      },
      {
        index: 1,
        name: 'second.txt',
        path: null,
        size: 3,
        mimeType: 'text/plain',
      },
    ],
  }
  const name = await encryptText(
    key,
    'first.txt',
    metadataAAD(context, 'name:0')
  )
  const manifest = await encryptText(
    key,
    encryptionManifest(plaintext),
    metadataAAD(context, 'manifest')
  )
  await page.route('**/api/d/tampered', (r) =>
    r.fulfill({
      json: {
        shortId: 'tampered',
        files: [
          {
            id: 'first',
            encryptionIndex: 0,
            name,
            size: '3',
            mimeType: 'text/plain',
          },
        ],
        totalSize: '6',
        expiresAt: '2099-01-01',
        encrypted: true,
        encryptionVersion: 2,
        encryptionContext: context,
        encryptedManifest: manifest,
      },
    })
  )
  await page.goto(`/d/tampered#key=${raw}&v=2&context=${context}`)
  await expect(
    page.getByText(
      'Der Schlüssel oder die Dateiintegrität konnte nicht geprüft werden.'
    )
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /herunterladen/i })
  ).toHaveCount(0)
})
