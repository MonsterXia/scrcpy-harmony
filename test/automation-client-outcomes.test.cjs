const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createServer } = require('node:http')
const load = require('./helpers/load-automation.cjs')
const { callAutomation } = load('src/cli/client.ts')
const { secureDirectory, publishDiscovery, discoveryDirectory } = load('src/main/automation/discovery.ts')

async function fixture(t, reply) {
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-outcome-'))
  t.after(() => fs.rm(profilePath, { recursive: true, force: true }))
  let writes = 0
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const value = JSON.parse(Buffer.concat(chunks))
    if (value.operation === 'input.text') writes++
    reply(value, response)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const directory = discoveryDirectory(profilePath)
  await secureDirectory(directory)
  await publishDiscovery(directory, { apiVersion: 1, endpoint: `http://127.0.0.1:${server.address().port}`, instanceId: 'outcomes', token: 'a'.repeat(64), pid: process.pid })
  return {
    writes: () => writes,
    call: operation => callAutomation({ apiVersion: 1, requestId: 'request', clientId: 'fixture', operation,
      params: operation === 'input.text' ? { session: 'session', text: 'fixture' } : {}, timeoutMs: 2000 },
    { profilePath, deadline: Date.now() + 2000, signal: new AbortController().signal }),
  }
}

const cases = [
  ['malformed JSON', 'application/json', '{', 'INTERNAL'],
  ['wrong identity', 'application/json', JSON.stringify({ apiVersion: 1, requestId: 'other', ok: true, data: {} }), 'INTERNAL'],
  ['unsupported version', 'application/json', JSON.stringify({ apiVersion: 2, requestId: 'request', ok: true, data: {} }), 'VERSION_MISMATCH'],
  ['invalid error envelope', 'application/json', JSON.stringify({ apiVersion: 1, requestId: 'request', ok: false, error: {} }), 'INTERNAL'],
  ['oversized response', 'application/json', 'x'.repeat(1048577), 'INTERNAL'],
  ['truncated binary envelope', 'application/vnd.scrcpy-plus.frame', Buffer.alloc(3), 'INTERNAL'],
  ['unexpected content type', 'text/plain', '{}', 'INTERNAL'],
]
for (const [name, contentType, body, code] of cases) {
  test(`dispatched writes retain unknown outcome after ${name}; reads remain not-started`, async t => {
    const f = await fixture(t, (_request, response) => { response.setHeader('content-type', contentType); response.end(body) })
    await assert.rejects(f.call('input.text'), { code, outcome: 'unknown', retryable: false })
    assert.equal(f.writes(), 1)
    await assert.rejects(f.call('service.status'), { code, outcome: 'not-started' })
    assert.equal(f.writes(), 1)
  })
}
test('validated server write outcomes are preserved', async t => {
  const f = await fixture(t, (request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ apiVersion: 1, requestId: request.requestId, ok: false,
      error: { code: 'BUSY', message: 'Input not dispatched', retryable: true, outcome: 'not-started' } }))
  })
  const result = await f.call('input.text')
  assert.deepEqual(result.error, { code: 'BUSY', message: 'Input not dispatched', retryable: true, outcome: 'not-started' })
  assert.equal(f.writes(), 1)
})
