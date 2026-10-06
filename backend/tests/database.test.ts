import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticator } from 'otplib'
import { app } from '../src/index'
import { prisma } from '../src/lib/prisma'
import { redisClient, connectRedis } from '../src/lib/rateLimit'
import { reserveQuota, releaseQuota } from '../src/lib/quota'
import { reserveDownload } from '../src/lib/downloads'
import { withJob, PersistentMap } from '../src/lib/jobs'
import {
  cleanupOnce,
  deleteTransfer,
  enqueueDeletion,
} from '../src/services/cleanup'
import { cleanOldLogs } from '../src/services/logger'
import { minioClient } from '../src/lib/minio'
import { config } from '../src/config'
import { seedSettings } from '../src/services/seed'
import { spawnSync } from 'child_process'

const db = new URL(process.env.DATABASE_URL || 'postgresql://missing'),
  redis = new URL(process.env.REDIS_URL || 'redis://missing')
if (
  !db.pathname.endsWith('_test') ||
  !['127.0.0.1', 'localhost'].includes(db.hostname) ||
  redis.pathname !== '/15'
)
  throw new Error(
    'Database tests require an isolated local *_test database and Redis DB 15'
  )
const http = () => request(app)
before(async () => {
  await connectRedis()
  await redisClient.flushDb()
  await prisma.downloadLog.deleteMany()
  await prisma.file.deleteMany()
  await prisma.transfer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.job.deleteMany()
  await prisma.setting.deleteMany()
  await prisma.log.deleteMany()
  await seedSettings()
})
after(async () => {
  await prisma.$disconnect()
  await redisClient.quit()
})
const createUser = async (name: string, extra: Record<string, unknown> = {}) =>
  prisma.user.create({
    data: {
      username: name,
      email: `${name}@example.com`,
      password: await bcrypt.hash('Test-password-123!', 12),
      emailVerified: true,
      ...extra,
    },
  })
test('parallel quota reservations, publish and delete preserve counters', async () => {
  const u = await createUser('quota')
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      withJob(`quota-${i}`, (tx) => reserveQuota(tx, u.id, 6, 10))
    )
  )
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: u.id } }))
      .storageReserved,
    6n
  )
  await withJob('publish', async (tx) => {
    await releaseQuota(tx, u.id, 6, true)
    await tx.transfer.create({
      data: {
        shortId: 'quota-transfer',
        userId: u.id,
        totalSize: 6n,
        expiresAt: new Date('2099-01-01'),
      },
    })
  })
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
  assert.equal(saved.storageUsed, 6n)
  assert.equal(saved.storageReserved, 0n)
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { shortId: 'quota-transfer' },
  })
  await Promise.all([deleteTransfer(transfer.id), deleteTransfer(transfer.id)])
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).storageUsed,
    0n
  )
})
test('one download slot admits exactly one concurrent reservation', async () => {
  const t = await prisma.transfer.create({
    data: {
      shortId: 'one-download',
      maxDownloads: 1,
      expiresAt: new Date('2099-01-01'),
    },
  })
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => reserveDownload(t.id))
  )
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    (await prisma.transfer.findUniqueOrThrow({ where: { id: t.id } }))
      .downloadCount,
    1
  )
})
test('persistent jobs survive client reconnect and advisory locks serialize updates', async () => {
  const jobs = new PersistentMap<{ count: number }>('upload')
  await jobs.set('serialized', { count: 0 })
  await Promise.all(
    Array.from({ length: 10 }, () =>
      withJob('serialized', async (tx) => {
        const value = await jobs.get('serialized', tx)
        await jobs.set('serialized', { count: value!.count + 1 }, tx)
      })
    )
  )
  await prisma.$disconnect()
  await prisma.$connect()
  assert.equal((await jobs.get('serialized'))?.count, 10)
  await jobs.delete('serialized')
})
test('object deletion failures retain the outbox until a retry succeeds', async () => {
  const original = minioClient.removeObject
  try {
    minioClient.removeObject = async () => {
      throw new Error('Simulated unavailable object storage')
    }
    await enqueueDeletion([{ key: 'fixture' }])
    await cleanupOnce()
    assert.equal(await prisma.job.count({ where: { kind: 'delete' } }), 1)
    minioClient.removeObject = async () => {}
    await cleanupOnce()
    assert.equal(await prisma.job.count({ where: { kind: 'delete' } }), 0)
  } finally {
    minioClient.removeObject = original
  }
})
test('log retention deletes both system and transfer download logs', async () => {
  const t = await prisma.transfer.create({
    data: { shortId: 'log-retention', expiresAt: new Date('2099-01-01') },
  })
  await prisma.log.create({
    data: {
      level: 'info',
      category: 'system',
      message: 'old',
      createdAt: new Date(0),
    },
  })
  await prisma.downloadLog.create({
    data: { transferId: t.id, createdAt: new Date(0) },
  })
  await cleanOldLogs(30)
  assert.equal(await prisma.log.count({ where: { message: 'old' } }), 0)
  assert.equal(await prisma.downloadLog.count(), 0)
})
test('login issues HttpOnly cookies; cookie-authenticated writes require CSRF and the same origin', async () => {
  const user = await createUser('cookie')
  const login = await http()
    .post('/api/auth/login')
    .send({ email: user.email, password: 'Test-password-123!' })
  assert.equal(login.status, 200)
  assert.equal(login.body.token, 'cookie-session')
  const cookies = login.headers['set-cookie'] as unknown as string[]
  assert.ok(cookies.find((c) => c.startsWith('token='))?.includes('HttpOnly'))
  const header = cookies.map((c) => c.split(';')[0]).join('; '),
    csrf = cookies
      .find((c) => c.startsWith('csrf='))!
      .split(';')[0]
      .slice(5)
  assert.equal(
    (await http().post('/api/auth/logout').set('cookie', header)).status,
    403
  )
  assert.equal(
    (
      await http()
        .post('/api/auth/logout')
        .set('cookie', header)
        .set('x-csrf-token', csrf)
        .set('origin', 'https://attacker.example')
    ).status,
    403
  )
  assert.equal(
    (
      await http()
        .post('/api/auth/logout')
        .set('cookie', header)
        .set('x-csrf-token', csrf)
    ).status,
    200
  )
})
test('2FA challenge cannot authorize API calls and is revoked with the session version', async () => {
  const secret = authenticator.generateSecret(),
    u = await createUser('twofactor', { totpEnabled: true, totpSecret: secret })
  const token = jwt.sign({ id: u.id, tokenVersion: 0 }, config.jwtSecret)
  assert.equal(
    (
      await http()
        .post('/api/auth/2fa/setup')
        .set('authorization', `Bearer ${token}`)
    ).status,
    409
  )
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).totpSecret,
    secret
  )
  const login = await http()
    .post('/api/auth/login')
    .send({ email: u.email, password: 'Test-password-123!' })
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
    where: { id: u.id },
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
test('password reset remains subject to 2FA; backup codes can be consumed only once concurrently', async () => {
  const code = 'ABCDE-12345',
    secret = authenticator.generateSecret()
  const u = await createUser('recovery', {
    totpEnabled: true,
    totpSecret: secret,
    totpBackupCodes: [await bcrypt.hash(code, 12)],
    passwordResetToken: 'test-reset-token',
    passwordResetExpiry: new Date('2099-01-01'),
  })
  const reset = await http()
    .post('/api/auth/reset-password')
    .send({ token: 'test-reset-token', password: 'New-test-password-456!' })
  assert.equal(reset.status, 200)
  assert.ok(reset.body.challengeToken)
  assert.ok(!reset.headers['set-cookie'])
  const responses = await Promise.all(
    [1, 2].map(() =>
      http()
        .post('/api/auth/2fa/login')
        .send({ challengeToken: reset.body.challengeToken, code })
    )
  )
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401])
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: u.id } }))
      .totpBackupCodes.length,
    0
  )
})

test('concurrent setting updates cannot persist inconsistent file and transfer limits', async () => {
  const admin = await createUser('settings-admin', { role: 'ADMIN' })
  const token = jwt.sign({ id: admin.id, tokenVersion: 0 }, config.jwtSecret)
  const responses = await Promise.all(
    [
      { 'storage.maxFileSizeBytes': String(8 * 1024 ** 3) },
      { 'storage.maxTransferSizeBytes': String(6 * 1024 ** 3) },
    ].map((settings) =>
      http()
        .put('/api/settings')
        .set('authorization', `Bearer ${token}`)
        .send({ settings })
    )
  )
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400])
  const settings = (
    await http().get('/api/settings').set('authorization', `Bearer ${token}`)
  ).body.settings
  assert.ok(
    Number(settings['storage.maxFileSizeBytes']) <=
      Number(settings['storage.maxTransferSizeBytes'])
  )
})

test('concurrent admin demotions always retain one administrator and revoke changed sessions', async () => {
  await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { role: 'USER' },
  })
  const admins = await Promise.all(
    ['admin-one', 'admin-two'].map((name) =>
      createUser(name, { role: 'ADMIN' })
    )
  )
  const tokens = admins.map((u) =>
    jwt.sign({ id: u.id, tokenVersion: 0 }, config.jwtSecret)
  )
  const responses = await Promise.all(
    admins.map((u, i) =>
      http()
        .put(`/api/admin/users/${u.id}`)
        .set('authorization', `Bearer ${tokens[i]}`)
        .send({ role: 'USER' })
    )
  )
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
  assert.equal(await prisma.user.count({ where: { role: 'ADMIN' } }), 1)
  const demoted = responses.findIndex((r) => r.status === 200)
  assert.equal(
    (
      await http()
        .get('/api/auth/me')
        .set('authorization', `Bearer ${tokens[demoted]}`)
    ).status,
    401
  )
})

test('diagnostics require an admin and a short-lived header token, and never echo secrets', async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })
  const token = jwt.sign(
    { id: admin.id, tokenVersion: admin.tokenVersion },
    config.jwtSecret
  )
  const auth = `Bearer ${token}`
  const issued = await http()
    .get('/api/admin/diag-token')
    .set('authorization', auth)
  assert.equal(issued.status, 200)
  assert.equal(issued.body.expiresIn, 300)
  assert.equal(
    (
      await http()
        .get(`/api/diag?key=${issued.body.token}`)
        .set('authorization', auth)
    ).status,
    401
  )
  const response = await http()
    .get('/api/diag')
    .set('authorization', auth)
    .set('x-diag-key', issued.body.token)
    .set('cookie', 'private=fixture-secret')
    .set('x-private-credential', 'fixture-secret')
    .set('user-agent', 'review-fixture')
  assert.equal(response.status, 200)
  assert.equal(response.body.headers['user-agent'], 'review-fixture')
  assert.equal(response.body.headers.authorization, undefined)
  assert.equal(response.body.headers.cookie, undefined)
  assert.equal(response.body.headers['x-diag-key'], undefined)
  assert.ok(!JSON.stringify(response.body).includes('fixture-secret'))
  const expired = jwt.sign({ kind: 'diagnostic' }, config.jwtSecret, {
    expiresIn: -1,
  })
  assert.equal(
    (
      await http()
        .get('/api/diag')
        .set('authorization', auth)
        .set('x-diag-key', expired)
    ).status,
    401
  )
})

test('legacy init history is renamed only after checksum verification without changing data', async () => {
  const rows = await prisma.$queryRaw<{ id: string; checksum: string }[]>`
    SELECT id,checksum FROM "_prisma_migrations"
    WHERE migration_name='19700101000000_init' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`
  assert.equal(rows.length, 1)
  const initial = rows[0]
  const users = await prisma.user.count()
  const runBaseline = () =>
    spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/scripts/baseline.ts',
        '--apply',
        '--backup-confirmed',
      ],
      { encoding: 'utf8', timeout: 30_000 }
    )
  try {
    await prisma.$executeRaw`UPDATE "_prisma_migrations" SET migration_name='init', checksum=${'0'.repeat(64)} WHERE id=${initial.id}`
    const refused = runBaseline()
    assert.equal(refused.status, 1)
    assert.ok(refused.stderr.includes('different checksum'))
    await prisma.$executeRaw`UPDATE "_prisma_migrations" SET checksum=${initial.checksum} WHERE id=${initial.id}`
    assert.equal(runBaseline().status, 0)
    assert.equal(runBaseline().status, 0)
    const history = await prisma.$queryRaw<
      { migration_name: string; checksum: string }[]
    >`
      SELECT migration_name,checksum FROM "_prisma_migrations" WHERE id=${initial.id}`
    assert.deepEqual(history[0], {
      migration_name: '19700101000000_init',
      checksum: initial.checksum,
    })
    assert.equal(await prisma.user.count(), users)
  } finally {
    await prisma.$executeRaw`UPDATE "_prisma_migrations" SET migration_name='19700101000000_init', checksum=${initial.checksum} WHERE id=${initial.id}`
  }
})
