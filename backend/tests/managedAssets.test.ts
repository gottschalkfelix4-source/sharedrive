import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { config } from '../src/config'
import { prisma } from '../src/lib/prisma'
import { errorHandler } from '../src/middleware/errorHandler'

let app: express.Express
let token: string
let mutations = 0
let restoreDatabaseMocks: () => void
const savedEnvironment = {
  SHAREDRIVE_LOGO_URL: process.env.SHAREDRIVE_LOGO_URL,
  SHAREDRIVE_FAVICON_URL: process.env.SHAREDRIVE_FAVICON_URL,
}

before(async () => {
  process.env.SHAREDRIVE_LOGO_URL = 'https://example.com/managed-logo.png'
  process.env.SHAREDRIVE_FAVICON_URL = '/api/assets/favicon'
  const { assetsRouter } = await import('../src/routes/assets')
  const { minioClient } = await import('../src/lib/minio')
  const user = {
    id: 'managed-asset-admin', username: 'admin', email: 'admin@example.com',
    role: 'ADMIN', tokenVersion: 0,
  }
  const originalFindUser = prisma.user.findUnique
  const originalUpsert = prisma.setting.upsert
  prisma.user.findUnique = (async () => user) as typeof prisma.user.findUnique
  prisma.setting.upsert = (async () => { mutations++ }) as typeof prisma.setting.upsert
  restoreDatabaseMocks = () => {
    prisma.user.findUnique = originalFindUser
    prisma.setting.upsert = originalUpsert
  }
  mock.method(minioClient, 'putObject', async () => { mutations++ })
  mock.method(minioClient, 'removeObject', async () => { mutations++ })
  mock.method(minioClient, 'statObject', async () => { throw new Error('Unexpected storage read') })
  mock.method(minioClient, 'getObject', async () => { throw new Error('Unexpected storage read') })
  token = jwt.sign({ id: user.id, tokenVersion: 0 }, config.jwtSecret)
  app = express()
  app.use('/api/assets', assetsRouter)
  app.use(errorHandler)
})

after(async () => {
  mock.restoreAll()
  restoreDatabaseMocks?.()
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await prisma.$disconnect()
})

test('managed logo and favicon uploads reject real admin multipart uploads without storage or DB mutations', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  for (const type of ['logo', 'favicon']) {
    const response = await request(app).post(`/api/assets/upload?type=${type}`)
      .set('authorization', `Bearer ${token}`)
      .attach('file', png, { filename: 'fixture.png', contentType: 'image/png' })
    assert.equal(response.status, 400)
    assert.match(response.body.error, new RegExp(`appearance\\.${type}Url.*managed`))
    assert.equal(mutations, 0)
  }
})

test('managed assets reject before parsing even a malformed upload body', async () => {
  const response = await request(app).post('/api/assets/upload?type=logo')
    .set('authorization', `Bearer ${token}`)
    .set('content-type', 'application/json')
    .send('{}')
  assert.equal(response.status, 400)
  assert.match(response.body.error, /managed by the deployment environment/)
  assert.equal(mutations, 0)
})

test('managed logo and favicon deletion rejects without deleting stored assets or resetting DB values', async () => {
  for (const type of ['logo', 'favicon']) {
    const response = await request(app).delete(`/api/assets/${type}`)
      .set('authorization', `Bearer ${token}`)
    assert.equal(response.status, 400)
    assert.match(response.body.error, new RegExp(`appearance\\.${type}Url.*managed`))
    assert.equal(mutations, 0)
  }
})

test('asset type whitelist rejects inherited object keys before parsing or storage access', async () => {
  for (const type of ['toString', 'constructor', '__proto__']) {
    const upload = await request(app).post(`/api/assets/upload?type=${type}`)
      .set('authorization', `Bearer ${token}`)
      .set('content-type', 'application/json').send('{}')
    assert.equal(upload.status, 400)
    assert.match(upload.body.error, /Invalid type/)
    const removal = await request(app).delete(`/api/assets/${type}`)
      .set('authorization', `Bearer ${token}`)
    assert.equal(removal.status, 400)
    assert.match(removal.body.error, /Invalid type/)
    const read = await request(app).get(`/api/assets/${type}`)
    assert.equal(read.status, 404)
    assert.equal(mutations, 0)
  }
  const malformedType = await request(app).post('/api/assets/upload?type[value]=logo')
    .set('authorization', `Bearer ${token}`)
    .set('content-type', 'application/json').send('{}')
  assert.equal(malformedType.status, 400)
})
