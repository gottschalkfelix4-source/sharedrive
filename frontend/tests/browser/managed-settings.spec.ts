import { test, expect, type Page } from '@playwright/test'

const fixtureSettings = {
  'app.name': 'Docker Share',
  'app.baseUrl': 'https://share.example.com',
  'app.description': 'Original description',
  'app.maxFilesPerTransfer': '100',
  'storage.maxFileSizeBytes': '5368709120',
  'storage.maxTransferSizeBytes': '10737418240',
  'storage.userStorageQuotaBytes': '0',
  'storage.retentionDaysAnonymous': '7',
  'storage.retentionDaysRegistered': '30',
  'storage.s3Enabled': 'true',
  'storage.s3Endpoint': 's3.example.com',
  'storage.s3Port': '443',
  'storage.s3UseSSL': 'true',
  'storage.s3Bucket': 'files',
  'storage.s3AccessKey': 'fixture-access',
  'storage.s3SecretKey': '\u2022\u2022\u2022\u2022',
  'appearance.primaryColor': '#6366f1',
  'appearance.logoUrl': '/logo.png',
  'appearance.faviconUrl': '',
}

async function settingsFixture(page: Page, managedKeys?: string[]) {
  page.on('pageerror', (error) => { throw error })
  const writes: Record<string, string>[] = []
  await page.addInitScript(() => localStorage.setItem('session', '1'))
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/setup/status') return route.fulfill({ json: { needsSetup: false } })
    if (path === '/api/auth/me') return route.fulfill({ json: { user: {
      id: 'admin', username: 'admin', email: 'admin@example.com', role: 'ADMIN',
    } } })
    if (path === '/api/settings/public') return route.fulfill({ json: {
      appName: 'ShareDrive', primaryColor: '#6366f1', logoUrl: '', faviconUrl: '',
    } })
    if (path === '/api/settings') {
      if (route.request().method() === 'PUT') {
        writes.push(route.request().postDataJSON().settings)
        return route.fulfill({ json: { message: 'Saved' } })
      }
      return route.fulfill({ json: { settings: fixtureSettings, managedKeys } })
    }
    return route.fulfill({ json: {} })
  })
  return writes
}

test('Docker-managed fields are disabled and excluded from ordinary saves', async ({ page }) => {
  const writes = await settingsFixture(page, ['app.name', 'app.maxFilesPerTransfer'])
  await page.goto('/admin/settings')
  await expect(page.getByLabel('Anwendungsname')).toBeDisabled()
  await expect(page.getByLabel('Max. Dateien pro Transfer')).toBeDisabled()
  await expect(page.getByText('Docker', { exact: true })).toHaveCount(2)
  await page.getByLabel('Beschreibung').fill('Updated description')
  await page.getByRole('button', { name: /speichern/ }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({
    'app.baseUrl': 'https://share.example.com', 'app.description': 'Updated description',
  })
})

test('managed byte limits stay exact and S3 tests remain available', async ({ page }) => {
  const managed = [
    'storage.maxFileSizeBytes', 'storage.maxTransferSizeBytes',
    'storage.s3Enabled', 'storage.s3Endpoint', 'storage.s3Port', 'storage.s3UseSSL',
    'storage.s3Region', 'storage.s3Bucket', 'storage.s3AccessKey', 'storage.s3SecretKey',
  ]
  const writes = await settingsFixture(page, managed)
  let s3TestCount = 0
  await page.route('**/api/settings/test-s3', (route) => {
    s3TestCount++
    expect(route.request().postDataJSON().endpoint).toBe('s3.example.com')
    return route.fulfill({ json: { message: 'Connected' } })
  })
  await page.goto('/admin/settings/storage')
  await expect(page.getByLabel('Max. Dateigr\u00f6\u00dfe (GB)')).toBeDisabled()
  await expect(page.getByRole('switch', { name: 'Externen S3-Speicher verwenden' })).toBeDisabled()
  await page.getByLabel('Quota pro Nutzer (GB)').fill('12')
  const saves = page.getByRole('button', { name: /speichern/ })
  await expect(saves.nth(1)).toBeDisabled()
  await saves.first().click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({
    'storage.userStorageQuotaBytes': '12000000000',
    'storage.retentionDaysAnonymous': '7', 'storage.retentionDaysRegistered': '30',
  })
  await page.getByRole('button', { name: 'Verbindung testen' }).click()
  await expect.poll(() => s3TestCount).toBe(1)
})

test('managed assets cannot upload, remove or accept a dropped replacement', async ({ page }) => {
  await settingsFixture(page, ['appearance.logoUrl', 'appearance.primaryColor'])
  let assetRequests = 0
  await page.route('**/api/assets/**', (route) => {
    assetRequests++
    return route.fulfill({ json: { url: '/changed.png' } })
  })
  await page.goto('/admin/settings/appearance')
  await expect(page.getByRole('button', { name: 'Farbe speichern' })).toBeDisabled()
  await expect(page.getByTitle('Indigo', { exact: true })).toBeDisabled()
  await expect(page.getByTitle('Remove Logo')).toBeDisabled()
  await expect(page.locator('input[type=file]').first()).toBeDisabled()
  await expect(page.locator('input[type=file]').nth(1)).toBeEnabled()
  const dropZone = page.locator('[aria-disabled=true]')
  await dropZone.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['fixture'], 'new.png', { type: 'image/png' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }))
  })
  expect(assetRequests).toBe(0)
  await expect(page.getByText('Logo hochgeladen')).toHaveCount(0)
})

test('older API without managedKeys keeps settings editable', async ({ page }) => {
  const writes = await settingsFixture(page)
  await page.goto('/admin/settings')
  await expect(page.getByLabel('Anwendungsname')).toBeEnabled()
  await page.getByLabel('Anwendungsname').fill('Local Share')
  await page.getByRole('button', { name: /speichern/ }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]['app.name']).toBe('Local Share')
})

test('managed status fits desktop and mobile settings forms', async ({ page }, testInfo) => {
  await settingsFixture(page, ['app.name', 'app.baseUrl', 'app.maxFilesPerTransfer'])
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/admin/settings')
    await expect(page.getByLabel('Anwendungsname')).toBeDisabled()
    await expect(page.getByText('Docker', { exact: true })).toHaveCount(3)
    await expect(page.locator('main > div').last()).toHaveCSS('opacity', '1')
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth
    )).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`managed-settings-${viewport.width}.png`), fullPage: true })
  }
})
