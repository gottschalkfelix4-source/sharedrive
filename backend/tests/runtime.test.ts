import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { configureHttp, serveFrontend } from '../src/lib/http'
import { csrfProtection } from '../src/middleware/csrf'
import { errorHandler } from '../src/middleware/errorHandler'

let directory: string
const savedEnvironment = {
  FRONTEND_DIST_PATH: process.env.FRONTEND_DIST_PATH,
  TRUST_PROXY: process.env.TRUST_PROXY,
  NODE_ENV: process.env.NODE_ENV,
}

function application(trustProxy?: string) {
  if (trustProxy) process.env.TRUST_PROXY = trustProxy
  else delete process.env.TRUST_PROXY
  const app = express()
  configureHttp(app)
  app.use(cookieParser())
  app.use(csrfProtection)
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.get('/api/proxy', (req, res) => {
    res.cookie('token', 'test-session', { secure: req.secure, httpOnly: true })
    res.json({ protocol: req.protocol, ip: req.ip })
  })
  app.post('/api/write', (_req, res) => res.json({ ok: true }))
  serveFrontend(app)
  app.use(errorHandler)
  return app
}

before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharedrive-runtime-'))
  fs.mkdirSync(path.join(directory, 'assets'))
  fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><title>ShareDrive fixture</title>')
  fs.writeFileSync(path.join(directory, 'assets', 'app.js'), 'console.log("fixture")')
  process.env.FRONTEND_DIST_PATH = directory
  process.env.NODE_ENV = 'production'
})

after(() => {
  fs.rmSync(directory, { recursive: true, force: true })
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('one HTTP server serves the SPA, deep links, bundles and API routes', async () => {
  const app = application()
  for (const route of ['/', '/setup', '/d/transfer-id', '/admin/settings']) {
    const response = await request(app).get(route).set('accept', 'text/html')
    assert.equal(response.status, 200)
    assert.match(response.text, /ShareDrive fixture/)
    assert.match(response.headers['cache-control'], /no-cache/)
  }
  const asset = await request(app).get('/assets/app.js')
  assert.equal(asset.status, 200)
  assert.match(asset.headers['content-type'], /javascript/)
  assert.match(asset.text, /console.log/)
  const health = await request(app).get('/api/health')
  assert.equal(health.status, 200)
  assert.deepEqual(health.body, { ok: true })
})

test('missing API routes, bundles and non-navigation requests never return SPA HTML', async () => {
  const app = application()
  for (const route of ['/api', '/api/not-found', '/api/setup/ssl', '/api/setup/credentials']) {
    const response = await request(app).get(route).set('accept', 'text/html')
    assert.equal(response.status, 404)
    assert.deepEqual(response.body, { error: 'API endpoint not found' })
  }
  for (const route of ['/assets', '/assets/missing.js', '/assets/missing', '/favicon.ico']) {
    const response = await request(app).get(route).set('accept', 'text/html')
    assert.equal(response.status, 404)
    assert.doesNotMatch(response.text, /ShareDrive fixture/)
  }
  assert.equal((await request(app).get('/missing').set('accept', 'application/json')).status, 404)
  assert.equal((await request(app).post('/setup')).status, 404)
})

test('HTTP navigation has usable CSP without forced HTTPS or exposed referrers', async () => {
  const response = await request(application()).get('/')
  assert.equal(response.status, 200)
  assert.doesNotMatch(response.headers['content-security-policy'], /upgrade-insecure-requests/)
  assert.match(response.headers['content-security-policy'], /img-src 'self' data: blob: https:/)
  assert.equal(response.headers['strict-transport-security'], undefined)
  assert.equal(response.headers['referrer-policy'], 'no-referrer')
})

test('default trust covers loopback only and explicit proxy IPs/CIDRs control forwarded protocol', async () => {
  const local = application()
  const trust = local.get('trust proxy fn') as (ip: string, index: number) => boolean
  assert.equal(trust('127.0.0.1', 0), true)
  assert.equal(trust('::1', 0), true)
  assert.equal(trust('192.168.188.129', 0), false)
  assert.equal(trust('172.18.0.2', 0), false)
  const trusted = await request(local).get('/api/proxy')
    .set('x-forwarded-proto', 'https').set('x-forwarded-for', '203.0.113.8')
  assert.equal(trusted.body.protocol, 'https')
  assert.equal(trusted.body.ip, '203.0.113.8')
  assert.match(trusted.headers['set-cookie'][0], /; Secure/)

  const remoteOnly = application('192.168.188.2, 172.18.0.0/24')
  const remoteTrust = remoteOnly.get('trust proxy fn') as (ip: string, index: number) => boolean
  assert.equal(remoteTrust('192.168.188.2', 0), true)
  assert.equal(remoteTrust('172.18.0.2', 0), true)
  assert.equal(remoteTrust('192.168.188.3', 0), false)
  const untrusted = await request(remoteOnly).get('/api/proxy')
    .set('x-forwarded-proto', 'https').set('x-forwarded-for', '203.0.113.8')
  assert.equal(untrusted.body.protocol, 'http')
  assert.notEqual(untrusted.body.ip, '203.0.113.8')
  assert.doesNotMatch(untrusted.headers['set-cookie'][0], /; Secure/)
})

test('CSRF validates HTTPS origins only behind an explicitly trusted connection', async () => {
  const send = (app: express.Express) => request(app).post('/api/write')
    .set('host', 'share.example.com')
    .set('origin', 'https://share.example.com')
    .set('x-forwarded-proto', 'https')
    .set('cookie', 'token=test-session; csrf=fixture-csrf')
    .set('x-csrf-token', 'fixture-csrf')
  assert.equal((await send(application('loopback'))).status, 200)
  assert.equal((await send(application('192.168.188.2'))).status, 403)
})
