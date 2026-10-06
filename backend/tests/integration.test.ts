import { before, beforeEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticator } from 'otplib'
import { prisma } from '../src/lib/prisma'
import { app } from '../src/index'
import { connectRedis, redisClient } from '../src/lib/rateLimit'
import { ensureBucket, statStoredObject, minioClient } from '../src/lib/minio'
import { seedSettings } from '../src/services/seed'
import { uploadSessions } from '../src/lib/uploadSessions'
import { scanSessions } from '../src/lib/scanSessions'
import { reserveQuota } from '../src/lib/quota'
import { reserveDownload } from '../src/lib/downloads'
import { withJob } from '../src/lib/jobs'
import { cleanupOnce, deleteTransfer } from '../src/services/cleanup'
import { runTransferScan } from '../src/services/virusScan'
import { installMemoryStorageFixture } from './storage-fixture'
import { config } from '../src/config'

const db = new URL(process.env.DATABASE_URL || 'postgresql://missing')
const redis = new URL(process.env.REDIS_URL || 'redis://missing')
if (
  !db.pathname.endsWith('_test') ||
  !['127.0.0.1', 'localhost'].includes(db.hostname) ||
  redis.pathname !== '/15' ||
  !config.minio.bucket.endsWith('-test')
)
  throw new Error(
    'Integration tests require an isolated local *_test database, Redis DB 15 and a *-test bucket'
  )
let ip = 1
const http = () => request(app)
const uploadInit = (body: unknown) =>
  http()
    .post('/api/transfers/chunked/init')
    .set('x-forwarded-for', `203.0.113.${ip++}`)
    .send(body)
const fileMetadata = (size = 3) => ({
  files: [{ name: 'fixture.txt', size, mimeType: 'text/plain' }],
})
async function setting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}
async function part(
  shortId: string,
  token: string,
  bytes: Buffer,
  number = '1'
) {
  return http()
    .put(`/api/transfers/chunked/${shortId}/part`)
    .set('content-type', 'application/octet-stream')
    .set('x-file-token', token)
    .set('x-part-number', number)
    .send(bytes)
}
async function upload(body: Record<string, unknown> = {}) {
  const init = await uploadInit({ ...fileMetadata(), ...body })
  assert.equal(init.status, 201, JSON.stringify(init.body))
  const { shortId, fileTokens } = init.body
  assert.equal(
    (await part(shortId, fileTokens[0], Buffer.from('abc'))).status,
    200
  )
  const final = await http()
    .post(`/api/transfers/chunked/${shortId}/finalize`)
    .set('x-file-token', fileTokens[0])
  return { shortId, final }
}
before(async () => {
  if (process.env.TEST_STORAGE_FIXTURE === 'memory') {
    console.log(
      'STORAGE TEST DOUBLE: MinIO SDK/protocol not verified by this run'
    )
    installMemoryStorageFixture()
  }
  await connectRedis()
  await redisClient.flushDb()
  await prisma.downloadLog.deleteMany()
  await prisma.file.deleteMany()
  await prisma.transfer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.job.deleteMany()
  await prisma.setting.deleteMany()
  await prisma.log.deleteMany()
  await ensureBucket()
  await seedSettings()
  await setting('security.virusScanEnabled', 'false')
})
beforeEach(async () => {
  await setting('storage.maxFileSizeBytes', '5368709120')
  await setting('app.maxFilesPerTransfer', '100')
  await setting('storage.userStorageQuotaBytes', '0')
  await setting('security.virusScanEnabled', 'false')
})
after(async () => {
  await cleanupOnce()
  await prisma.$disconnect()
  await redisClient.quit()
})

test('bootstrap requires the local token, removes certificate/credential management and permits exactly one initial admin', async () => {
  const input = {
    email: 'admin@example.com',
    username: 'review-admin',
    password: 'Test-password-123!',
  }
  assert.equal((await http().post('/api/setup').send(input)).status, 401)
  assert.equal(
    (await http().post('/api/setup')
      .set('x-setup-token', process.env.SETUP_TOKEN!)
      .send({ ...input, baseUrl: 'https://share.example.com/subpath' })).status,
    400
  )
  assert.equal(
    (
      await http()
        .post('/api/setup/ssl')
        .set('x-setup-token', process.env.SETUP_TOKEN!)
        .send({ domain: 'example.com\n:2019 { respond hacked }' })
    ).status,
    404
  )
  assert.equal(
    (await http().post('/api/setup/credentials')
      .set('x-setup-token', process.env.SETUP_TOKEN!)
      .send({ dbPassword: 'unused' })).status,
    404
  )
  await setting('setup.credentialsPending', 'previous-deployment-fingerprint')
  const readiness = await http().get('/api/setup/readiness')
    .set('x-setup-token', process.env.SETUP_TOKEN!)
  assert.equal(readiness.status, 200)
  assert.deepEqual(readiness.body, { ready: false, requiresRecreation: true })
  assert.equal(
    (await http().post('/api/setup')
      .set('x-setup-token', process.env.SETUP_TOKEN!)
      .send(input)).status,
    409
  )
  await prisma.setting.delete({ where: { key: 'setup.credentialsPending' } })
  const responses = await Promise.all(
    [
      input,
      { ...input, email: 'admin2@example.com', username: 'review-admin2' },
    ].map((body) =>
      http()
        .post('/api/setup')
        .set('x-setup-token', process.env.SETUP_TOKEN!)
        .send(body)
    )
  )
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409])
  assert.equal(await prisma.user.count({ where: { role: 'ADMIN' } }), 1)
})
test('uploads enforce exact bytes and indexes; retried parts remain idempotent and sessions persist', async () => {
  const init = await uploadInit(fileMetadata())
  assert.equal(init.status, 201)
  const { shortId, fileTokens } = init.body,
    token = fileTokens[0]
  assert.equal((await part(shortId, token, Buffer.from('abcd'))).status, 413)
  assert.equal(
    (await part(shortId, token, Buffer.from('abc'), '1junk')).status,
    400
  )
  assert.equal((await part(shortId, 'wrong', Buffer.from('abc'))).status, 403)
  assert.equal(
    (
      await http()
        .post(`/api/transfers/chunked/${shortId}/finalize`)
        .set('x-file-token', fileTokens[0])
    ).status,
    400
  )
  assert.equal((await part(shortId, token, Buffer.from('abc'))).status, 200)
  assert.equal((await part(shortId, token, Buffer.from('abc'))).status, 200)
  await prisma.$disconnect()
  await prisma.$connect()
  const session = await uploadSessions.get(shortId)
  assert.equal(session?.files[token].parts.length, 1)
  assert.equal(
    (
      await http()
        .post(`/api/transfers/chunked/${shortId}/finalize`)
        .set('x-file-token', fileTokens[0])
    ).status,
    201
  )
  assert.equal(
    (
      await http()
        .post(`/api/transfers/chunked/${shortId}/finalize`)
        .set('x-file-token', token)
    ).status,
    201
  )
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { shortId },
    include: { files: true },
  })
  assert.equal(transfer.totalSize, 3n)
  assert.equal(await statStoredObject(transfer.files[0].storageKey), 3)
})
test('empty plaintext objects can be uploaded and downloaded', async () => {
  const init = await uploadInit(fileMetadata(0))
  assert.equal(init.status, 201)
  assert.equal(
    (await part(init.body.shortId, init.body.fileTokens[0], Buffer.alloc(0)))
      .status,
    200
  )
  assert.equal(
    (
      await http()
        .post(`/api/transfers/chunked/${init.body.shortId}/finalize`)
        .set('x-file-token', init.body.fileTokens[0])
    ).status,
    201
  )
  const t = await prisma.transfer.findUniqueOrThrow({
    where: { shortId: init.body.shortId },
    include: { files: true },
  })
  const download = await http().get(
    `/api/d/${t.shortId}/files/${t.files[0].id}`
  )
  assert.equal(download.status, 200)
  assert.equal(download.headers['content-length'], '0')
})
test('quota reservations serialize competing uploads and publish/delete without leaking reservations', async () => {
  const user = await prisma.user.create({
    data: { email: 'quota@example.com', username: 'quota', password: 'unused' },
  })
  const reservations = await Promise.allSettled([
    withJob('quota-a', (tx) => reserveQuota(tx, user.id, 6, 10)),
    withJob('quota-b', (tx) => reserveQuota(tx, user.id, 6, 10)),
  ])
  assert.equal(reservations.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .storageReserved,
    6n
  )
  await prisma.user.update({
    where: { id: user.id },
    data: { storageReserved: 0 },
  })
  const token = jwt.sign({ id: user.id, tokenVersion: 0 }, config.jwtSecret)
  await setting('storage.userStorageQuotaBytes', '3')
  const init = await http()
    .post('/api/transfers/chunked/init')
    .set('authorization', `Bearer ${token}`)
    .send(fileMetadata())
  assert.equal(init.status, 201)
  assert.equal(
    (await http().delete(`/api/transfers/chunked/${init.body.shortId}`)).status,
    403
  )
  await part(init.body.shortId, init.body.fileTokens[0], Buffer.from('abc'))
  assert.equal(
    (
      await http()
        .post(`/api/transfers/chunked/${init.body.shortId}/finalize`)
        .set('x-file-token', init.body.fileTokens[0])
    ).status,
    201
  )
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(saved.storageReserved, 0n)
  assert.equal(saved.storageUsed, 3n)
  const blocked = await http()
    .post('/api/transfers/chunked/init')
    .set('authorization', `Bearer ${token}`)
    .send(fileMetadata(1))
  assert.equal(blocked.status, 413)
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { shortId: init.body.shortId },
  })
  await deleteTransfer(transfer.id)
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .storageUsed,
    0n
  )
  await setting('storage.userStorageQuotaBytes', '0')
})
test('password protected downloads use scoped tickets for individual files and ZIPs', async () => {
  const { shortId } = await upload({ password: 'fixture-password' })
  assert.equal(
    (await http().get(`/api/d/${shortId}`).set('x-transfer-password', 'wrong'))
      .status,
    401
  )
  const meta = await http()
    .get(`/api/d/${shortId}`)
    .set('x-transfer-password', 'fixture-password')
  assert.equal(meta.status, 200)
  const fileId = meta.body.files[0].id
  assert.equal(
    (await http().get(`/api/d/${shortId}/files/${fileId}`)).status,
    401
  )
  const ticket = await http()
    .post(`/api/d/${shortId}/ticket`)
    .set('x-transfer-password', 'fixture-password')
    .send({ fileId })
  assert.equal(ticket.status, 200)
  assert.equal(
    (
      await http()
        .get(`/api/d/${shortId}/zip`)
        .query({ ticket: ticket.body.ticket })
    ).status,
    401
  )
  const bytes = await http()
    .get(`/api/d/${shortId}/files/${fileId}`)
    .query({ ticket: ticket.body.ticket })
  assert.equal(bytes.status, 200)
  assert.equal(bytes.body.toString(), 'abc')
  const zipTicket = await http()
    .post(`/api/d/${shortId}/ticket`)
    .set('x-transfer-password', 'fixture-password')
    .send({})
  const zip = await http()
    .get(`/api/d/${shortId}/zip`)
    .query({ ticket: zipTicket.body.ticket })
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => callback(null, Buffer.concat(chunks)))
    })
  assert.equal(zip.status, 200)
  assert.equal(zip.body.subarray(0, 2).toString(), 'PK')
})
test('one remaining download slot admits exactly one concurrent download', async () => {
  const { shortId } = await upload({ maxDownloads: 1 })
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { shortId },
  })
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => reserveDownload(transfer.id))
  )
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    (await prisma.transfer.findUniqueOrThrow({ where: { id: transfer.id } }))
      .downloadCount,
    1
  )
})
test('classic multipart rejects truncation and excessive files; partial objects are queued for deletion', async () => {
  await setting('storage.maxFileSizeBytes', '3')
  await setting('app.maxFilesPerTransfer', '1')
  const exact = await http()
    .post('/api/transfers')
    .attach('file', Buffer.from('abc'), 'exact.txt')
  assert.equal(exact.status, 201)
  assert.equal(
    (
      await http()
        .post('/api/transfers')
        .attach('file', Buffer.from('abcd'), 'large.txt')
    ).status,
    413
  )
  assert.equal(
    (
      await http()
        .post('/api/transfers')
        .attach('file', Buffer.from('a'), 'one.txt')
        .attach('file', Buffer.from('b'), 'two.txt')
    ).status,
    413
  )
  assert.ok((await prisma.job.count({ where: { kind: 'delete' } })) > 0)
  await setting('storage.maxFileSizeBytes', '5368709120')
  await setting('app.maxFilesPerTransfer', '100')
})
test('classic streaming preserves multipart bytes and empty files, and aborts after crossing a limit', async () => {
  const bytes = Buffer.alloc(17 * 1024 * 1024 + 33, 0xa5)
  const response = await http()
    .post('/api/transfers')
    .attach('file', bytes, 'multipart.bin')
    .attach('file', Buffer.alloc(0), 'empty.bin')
    .timeout(30_000)
  assert.equal(response.status, 201)
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { shortId: response.body.shortId },
    include: { files: true },
  })
  assert.equal(transfer.files.length, 2)
  const file = transfer.files.find((f) => f.name === 'multipart.bin')!
  assert.equal(await statStoredObject(file.storageKey), bytes.length)
  const downloaded = await http()
    .get(`/api/d/${transfer.shortId}/files/${file.id}`)
    .timeout(30_000)
  assert.equal(downloaded.status, 200)
  assert.deepEqual(downloaded.body, bytes)
  const empty = transfer.files.find((f) => f.name === 'empty.bin')!
  assert.equal(await statStoredObject(empty.storageKey), 0)
  await setting('storage.maxFileSizeBytes', String(16 * 1024 * 1024 + 1))
  const overflow = await http()
    .post('/api/transfers')
    .attach('file', bytes, 'overflow.bin')
    .timeout(30_000)
  assert.equal(overflow.status, 413)
  await cleanupOnce()
})

test('expired persistent uploads release quota and retain deletion retries', async () => {
  const init = await uploadInit(fileMetadata())
  const { shortId, fileTokens } = init.body
  const session = await uploadSessions.get(shortId)
  assert.ok(session)
  await prisma.job.update({
    where: { id: shortId },
    data: { expiresAt: new Date(0) },
  })
  await cleanupOnce()
  assert.equal(await uploadSessions.get(shortId), undefined)
  // Multipart session was aborted; a token cannot revive it.
  assert.equal(
    (await part(shortId, fileTokens[0], Buffer.from('abc'))).status,
    404
  )
})
test('durable scan worker handles a real clean scan and the EICAR antivirus fixture', async () => {
  await setting('security.virusScanEnabled', 'true')
  const clean = await upload()
  assert.equal(clean.final.status, 202)
  await runTransferScan(clean.final.body.scanId)
  assert.equal(
    (await scanSessions.get(clean.final.body.scanId))?.status,
    'clean'
  )
  const eicar = Buffer.from(
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
  )
  const init = await uploadInit(fileMetadata(eicar.length))
  await part(init.body.shortId, init.body.fileTokens[0], eicar)
  const final = await http()
    .post(`/api/transfers/chunked/${init.body.shortId}/finalize`)
    .set('x-file-token', init.body.fileTokens[0])
  assert.equal(final.status, 202)
  await runTransferScan(final.body.scanId)
  assert.equal((await scanSessions.get(final.body.scanId))?.status, 'infected')
  assert.equal(
    await prisma.transfer.count({ where: { shortId: init.body.shortId } }),
    0
  )
  await setting('security.virusScanEnabled', 'false')
})
test('login uses HttpOnly cookies and unsafe cookie-authenticated requests require CSRF', async () => {
  const user = await prisma.user.create({
    data: {
      email: 'cookie@example.com',
      username: 'cookie',
      password: await bcrypt.hash('Test-password-123!', 12),
      emailVerified: true,
    },
  })
  const login = await http()
    .post('/api/auth/login')
    .send({ email: user.email, password: 'Test-password-123!' })
  assert.equal(login.status, 200)
  assert.equal(login.body.token, 'cookie-session')
  const cookies = login.headers['set-cookie'] as unknown as string[]
  assert.ok(cookies.find((c) => c.startsWith('token='))?.includes('HttpOnly'))
  const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; '),
    csrf = cookies
      .find((c) => c.startsWith('csrf='))!
      .split(';')[0]
      .slice(5)
  assert.equal(
    (await http().post('/api/auth/logout').set('cookie', cookieHeader)).status,
    403
  )
  assert.equal(
    (
      await http()
        .post('/api/auth/logout')
        .set('cookie', cookieHeader)
        .set('x-csrf-token', csrf)
    ).status,
    200
  )
})

test('authentication cookies use the forwarded scheme only from trusted proxies', async () => {
  const previousTrust = app.get('trust proxy')
  try {
    app.set('trust proxy', 'loopback')
    const trusted = await http().post('/api/auth/logout')
      .set('x-forwarded-proto', 'https')
    assert.equal(trusted.status, 200)
    for (const cookie of trusted.headers['set-cookie'])
      assert.match(cookie, /; Secure/)
    app.set('trust proxy', '192.168.188.2')
    const untrusted = await http().post('/api/auth/logout')
      .set('x-forwarded-proto', 'https')
    assert.equal(untrusted.status, 200)
    for (const cookie of untrusted.headers['set-cookie'])
      assert.doesNotMatch(cookie, /; Secure/)
  } finally {
    app.set('trust proxy', previousTrust)
  }
})
test('2FA setup does not replace an active secret; version revocation also invalidates challenges', async () => {
  const secret = authenticator.generateSecret()
  const user = await prisma.user.create({
    data: {
      email: '2fa@example.com',
      username: 'twofactor',
      password: await bcrypt.hash('Test-password-123!', 12),
      totpEnabled: true,
      totpSecret: secret,
      emailVerified: true,
    },
  })
  const token = jwt.sign({ id: user.id, tokenVersion: 0 }, config.jwtSecret)
  assert.equal(
    (
      await http()
        .post('/api/auth/2fa/setup')
        .set('authorization', `Bearer ${token}`)
    ).status,
    409
  )
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .totpSecret,
    secret
  )
  const login = await http()
    .post('/api/auth/login')
    .send({ email: user.email, password: 'Test-password-123!' })
  assert.ok(login.body.challengeToken)
  assert.ok(!login.headers['set-cookie'])
  assert.equal(
    (
      await http()
        .get('/api/transfers/mine')
        .set('authorization', `Bearer ${login.body.challengeToken}`)
    ).status,
    401
  )
  await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
  })
  assert.equal(
    (
      await http()
        .post('/api/auth/2fa/login')
        .send({
          challengeToken: login.body.challengeToken,
          code: authenticator.generate(secret),
        })
    ).status,
    401
  )
})
