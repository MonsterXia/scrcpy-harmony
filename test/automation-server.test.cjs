const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const load = require('./helpers/load-automation.cjs')
const req = { apiVersion: 1, requestId: 'request-1', clientId: 'test-client', operation: 'service.status', params: {} }
async function fixture(t, dispatch) {
  const { startAutomationServer } = load('src/main/automation/server.ts')
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-api-'))
  t.after(() => fs.rm(profilePath, { recursive: true, force: true }))
  const server = await startAutomationServer({ profilePath, instanceId: 'instance-1', dispatch: dispatch || (async () => ({ apiVersion: 1, requestId: req.requestId, ok: true, data: { instanceId: 'instance-1' } })) })
  t.after(() => server.close())
  const discovery = JSON.parse(await fs.readFile(path.join(profilePath, 'automation', 'discovery.json'), 'utf8'))
  return { ...server, profilePath, discovery, startAutomationServer }
}
function post(url, headers = {}, body = JSON.stringify(req)) {
  return new Promise((resolve, reject) => {
    const request = http.request(url + '/v1/call', { method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }))
    })
    request.on('error', reject); request.end(body)
  })
}
test('local API authenticates before dispatch and rejects browser and wrong-instance requests', async t => {
  let calls = 0
  const f = await fixture(t, async () => { calls++; return { apiVersion: 1, requestId: 'request-1', ok: true, data: {} } })
  assert.match(f.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/)
  for (const headers of [{}, { authorization: 'Bearer invalid' }, { authorization: `Bearer ${f.discovery.token}`, origin: 'https://example.com' }, { authorization: `Bearer ${f.discovery.token}`, host: 'attacker.invalid' }, { authorization: `Bearer ${f.discovery.token}`, 'x-scrcpy-instance': 'old-instance' }]) {
    const r = await post(f.endpoint, headers)
    assert.equal(r.status, 403)
    assert.equal(r.body.error.code, 'UNAUTHORIZED')
  }
  assert.equal(calls, 0)
  const r = await post(f.endpoint, { authorization: `Bearer ${f.discovery.token}`, 'x-scrcpy-instance': f.discovery.instanceId })
  assert.equal(r.body.ok, true); assert.equal(calls, 1)
  assert.equal(r.headers['access-control-allow-origin'], undefined)
  assert.equal(JSON.stringify(r).includes(f.discovery.token), false)
})
test('request limits and invalid payloads never reach handlers', async t => {
  let calls = 0
  const f = await fixture(t, async () => { calls++; throw Error('not called') })
  const headers = { authorization: `Bearer ${f.discovery.token}`, 'x-scrcpy-instance': f.discovery.instanceId }
  for (const body of ['{', JSON.stringify({ ...req, params: { unrecognized: 1 } }), ' '.repeat(1024 * 1024 + 1)]) {
    const r = await post(f.endpoint, headers, body)
    assert.equal(r.body.ok, false); assert.equal(r.body.error.code, 'INVALID_ARGUMENT')
  }
  assert.equal(calls, 0)
})
test('deadline aborts a hung handler and returns bounded structured timeout', async t => {
  let aborted = false
  const f = await fixture(t, async (_r, context) => {
    context.signal.addEventListener('abort', () => { aborted = true })
    return new Promise(() => {})
  })
  const r = await post(f.endpoint, { authorization: `Bearer ${f.discovery.token}`, 'x-scrcpy-instance': f.discovery.instanceId }, JSON.stringify({ ...req, timeoutMs: 25 }))
  assert.equal(r.body.error.code, 'TIMEOUT'); assert.equal(aborted, true)
})
test('client disconnect and server shutdown abort active operations', async t => {
  let started, aborted
  const began = new Promise(resolve => { started = resolve })
  const ended = new Promise(resolve => { aborted = resolve })
  const f = await fixture(t, async (_r, context) => { started(); context.signal.addEventListener('abort', aborted); return new Promise(() => {}) })
  const r = http.request(f.endpoint + '/v1/call', { method: 'POST', headers: { authorization: `Bearer ${f.discovery.token}`, 'x-scrcpy-instance': f.discovery.instanceId, 'content-type': 'application/json' } })
  r.on('error', () => {}); r.end(JSON.stringify(req)); await began; r.destroy(); await ended
  await f.close()
  await assert.rejects(fs.access(path.join(f.profilePath, 'automation', 'discovery.json')))
  await assert.rejects(post(f.endpoint))
})
test('profile ownership is exclusive and credentials are private; restart rotates identity', async t => {
  const f = await fixture(t)
  await assert.rejects(f.startAutomationServer({ profilePath: f.profilePath, instanceId: 'second', dispatch: async () => ({}) }), { code: 'BUSY' })
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(path.join(f.profilePath, 'automation'))).mode & 0o077, 0)
    assert.equal((await fs.stat(path.join(f.profilePath, 'automation', 'discovery.json'))).mode & 0o077, 0)
  }
  await f.close()
  const next = await f.startAutomationServer({ profilePath: f.profilePath, instanceId: 'next', dispatch: async () => ({}) }); t.after(() => next.close())
  const discovery = JSON.parse(await fs.readFile(path.join(f.profilePath, 'automation', 'discovery.json'), 'utf8'))
  assert.notEqual(discovery.token, f.discovery.token)
  assert.equal(discovery.instanceId, 'next')
})
test('symlinked credential directory is rejected without changing its target permissions', async t => {
  if (process.platform === 'win32') return t.skip('POSIX symlink permission boundary')
  const { startAutomationServer } = load('src/main/automation/server.ts')
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-symlink-')); t.after(() => fs.rm(base, { recursive: true, force: true }))
  await fs.mkdir(path.join(base, 'profile')); await fs.mkdir(path.join(base, 'public'), { mode: 0o755 })
  await fs.symlink(path.join(base, 'public'), path.join(base, 'profile', 'automation'))
  await assert.rejects(startAutomationServer({ profilePath: path.join(base, 'profile'), instanceId: 'test', dispatch: async () => ({}) }), { code: 'UNAUTHORIZED' })
  assert.equal((await fs.stat(path.join(base, 'public'))).mode & 0o777, 0o755)
})
test('failed discovery publication releases socket ownership so startup can be retried', async t => {
  const { startAutomationServer } = load('src/main/automation/server.ts')
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-failed-start-')); t.after(() => fs.rm(profilePath, { recursive: true, force: true }))
  await fs.mkdir(path.join(profilePath, 'automation', 'discovery.json'), { recursive: true })
  await assert.rejects(startAutomationServer({ profilePath, instanceId: 'failed', dispatch: async () => ({}) }))
  await assert.rejects(fs.access(path.join(profilePath, 'automation', 'server.lock')))
  await fs.rmdir(path.join(profilePath, 'automation', 'discovery.json'))
  const server = await startAutomationServer({ profilePath, instanceId: 'recovered', dispatch: async () => ({}) }); t.after(() => server.close())
})
test('discovery rejects non-loopback endpoints and stopped process records', async t => {
  const { readDiscovery } = load('src/main/automation/discovery.ts')
  const f = await fixture(t)
  const file = path.join(f.profilePath, 'automation', 'discovery.json')
  await fs.writeFile(file, JSON.stringify({ ...f.discovery, endpoint: 'http://example.com:9000' }))
  await assert.rejects(readDiscovery(f.profilePath), { code: 'UNAVAILABLE' })
  await fs.writeFile(file, JSON.stringify({ ...f.discovery, pid: 2147483647 }))
  await assert.rejects(readDiscovery(f.profilePath), { code: 'UNAVAILABLE' })
})
test('unsafe configured bind hosts fail closed instead of being silently ignored', async t => {
  const { startAutomationServer } = load('src/main/automation/server.ts')
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-host-')); t.after(() => fs.rm(profilePath, { recursive: true, force: true }))
  await assert.rejects(startAutomationServer({ profilePath, instanceId: 'test', host: '0.0.0.0', dispatch: async () => ({}) }).then(async value => { await value.close() }), { code: 'INVALID_ARGUMENT' })
})
