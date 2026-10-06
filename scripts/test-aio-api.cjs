const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = 'http://127.0.0.1:3000/api';
const fixturePath = '/data/aio-smoke-fixture.json';
const secretPath = '/data/config/secrets.json';
const password = 'AIO-Test-Admin-123!';
const email = 'aio-admin@example.com';
const bytes = 'ShareDrive AIO persistent object fixture\n';

async function json(path, options = {}, status = 200) {
  const response = await fetch(`${root}${path}`, options);
  assert.equal(response.status, status, `${path}: unexpected HTTP status`);
  return response.json();
}

async function scanUpload(content, filename, expected) {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), filename);
  const response = await fetch(`${root}/transfers`, { method: 'POST', body: form });
  assert.equal(response.status, 202, 'Plaintext uploads must use the scanner');
  const { scanId } = await response.json();
  assert.ok(scanId);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = await json(`/scan/${scanId}`);
    if (result.status === 'scanning') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    assert.equal(result.status, expected, 'Unexpected antivirus verdict');
    return result.result;
  }
  throw new Error('Antivirus test timed out');
}

async function login() {
  const response = await fetch(`${root}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await response.json()).user.role, 'ADMIN');
}

function secretHash() {
  assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(secretPath).uid, 0);
  return crypto.createHash('sha256').update(fs.readFileSync(secretPath)).digest('hex');
}

function infrastructure() {
  const credentials = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
  const redis = (...args) => execFileSync('redis-cli', ['-h', '127.0.0.1', ...args], {
    env: { ...process.env, REDISCLI_AUTH: credentials.redis_password }, encoding: 'utf8',
  }).trim();
  if ((process.env.AIO_TEST_PHASE || 'initial') === 'initial') {
    assert.equal(redis('set', 'aio:test:persistence', 'persistent-redis-fixture'), 'OK');
  }
  assert.equal(redis('get', 'aio:test:persistence'), 'persistent-redis-fixture');
  const internalPorts = new Set([5432, 6379, 9000, 9001, 3310]);
  const seen = new Set();
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    for (const line of fs.readFileSync(file, 'utf8').trim().split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields[3] !== '0A') continue;
      const [address, hexPort] = fields[1].split(':');
      const port = Number.parseInt(hexPort, 16);
      if (port === 3000) continue;
      assert.ok(internalPorts.has(port), `Unexpected listening TCP port: ${port}`);
      assert.ok(['0100007F', '00000000000000000000000001000000'].includes(address), `Internal port ${port} is not loopback-only`);
      seen.add(port);
    }
  }
  for (const port of [5432, 6379, 9000, 3310]) assert.ok(seen.has(port));
}

async function download(shortId) {
  const transfer = await json(`/d/${shortId}`);
  assert.equal(transfer.files.length, 1);
  const response = await fetch(`${root}/d/${shortId}/files/${transfer.files[0].id}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), bytes);
}

async function main() {
  assert.deepEqual(await json('/ready'), { ok: true });
  const page = await fetch('http://127.0.0.1:3000/setup');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="root">/);
  const phase = process.env.AIO_TEST_PHASE || 'initial';
  if (phase === 'initial') {
    assert.equal((await json('/setup/status')).needsSetup, true);
    const setup = { email, username: 'aio-admin', password, baseUrl: 'http://localhost:8088' };
    await json('/setup', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(setup),
    }, 401);
    const tokenFile = '/data/.setup/token';
    assert.equal(fs.statSync(tokenFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(tokenFile).uid, 1000);
    const token = fs.readFileSync(tokenFile, 'utf8').trim();
    assert.ok(token.length >= 32);
    await json('/setup', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-setup-token': token },
      body: JSON.stringify(setup),
    }, 201);
    await login();
    const published = await scanUpload(bytes, 'persistent.txt', 'clean');
    assert.ok(published.shortId);
    await download(published.shortId);
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    await scanUpload(eicar, 'antivirus-fixture.txt', 'infected');
    fs.writeFileSync(fixturePath, JSON.stringify({ shortId: published.shortId, secretHash: secretHash() }), { mode: 0o600 });
  } else {
    assert.ok(['restart', 'recreate'].includes(phase));
    assert.equal((await json('/setup/status')).needsSetup, false);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.equal(secretHash(), fixture.secretHash, 'Persistent credentials changed');
    await login();
    await download(fixture.shortId);
  }
  assert.equal((await json('/setup/status')).needsSetup, false);
  infrastructure();
  execFileSync('python3', ['/opt/sharedrive/aio/healthcheck.py'], { stdio: 'pipe' });
  console.log(`AIO ${phase}: admin, credentials, PostgreSQL, MinIO and scanner checks passed.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
