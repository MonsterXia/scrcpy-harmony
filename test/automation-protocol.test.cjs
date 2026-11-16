const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/load-automation.cjs')
const request = (patch = {}) => ({ apiVersion: 1, requestId: 'test-1', clientId: 'cli-test', operation: 'devices.list', params: {}, ...patch })

test('protocol rejects unknown fields, operations and invalid deadlines before dispatch', () => {
  const { parseRequest } = load('src/common/automation/protocol.ts')
  for (const patch of [{ operation: 'invoke' }, { params: { target: 'implicit' } }, { timeoutMs: NaN }, { timeoutMs: 0 }, { timeoutMs: 600001 }, { timeoutMs: 1.5 }, { extra: true }, { clientId: '' }, { params: null }]) {
    assert.throws(() => parseRequest(request(patch)), { code: 'INVALID_ARGUMENT' })
  }
  assert.throws(() => parseRequest(request({ apiVersion: 2 })), { code: 'VERSION_MISMATCH' })
  assert.equal(parseRequest(request()).timeoutMs, 30000)
  assert.equal(parseRequest(request({ timeoutMs: 1 })).timeoutMs, 1)
})

test('capabilities distinguish platform support, implemented actions and authorization', () => {
  const { deviceCapabilities } = load('src/common/automation/capabilities.ts')
  const enabled = new Set(['input.tap', 'screen.capture'])
  const ios = deviceCapabilities({ key: 'ios:airplay-receiver', platform: 'ios', state: 'waiting' }, enabled)
  assert.equal(ios['input.tap'].supported, false)
  assert.equal(ios['screen.capture'].supported, true)
  assert.equal(ios['screen.capture'].available, false)
  const harmony = deviceCapabilities({ key: 'h1', platform: 'harmony', state: 'unauthorized' }, enabled)
  assert.equal(harmony['input.tap'].supported, true)
  assert.equal(harmony['input.tap'].available, false)
  const missing = deviceCapabilities({ key: 'a1', platform: 'android', state: 'ready' }, new Set())
  assert.equal(missing['input.tap'].supported, false)
  assert.equal(missing['input.tap'].reason, 'not-implemented')
})

test('service preserves devices from successful providers and exposes structured provider errors', async () => {
  const { createAutomationService } = load('src/main/automation/service.ts')
  const service = createAutomationService({ instanceId: 'instance-test', version: 'test', discover: async () => ({ targets: [{ key: 'a1', name: 'Android', platform: 'android', state: 'ready' }], errors: ['harmony'] }) })
  const context = { clientId: 'cli-test', deadline: Date.now() + 1000, signal: new AbortController().signal }
  const result = await service.dispatch(request(), context)
  assert.equal(result.ok, true)
  assert.equal(result.data.devices[0].key, 'a1')
  assert.deepEqual(result.data.errors, [{ platform: 'harmony', code: 'DISCOVERY_FAILED' }])
  assert.equal('error' in result, false)
  const missing = await service.dispatch(request({ operation: 'devices.capabilities', params: { device: 'absent' } }), context)
  assert.equal(missing.error.code, 'UNAVAILABLE')
  const empty = createAutomationService({ instanceId: 'empty', version: 'test', discover: async () => ({ targets: [], errors: [] }) })
  const absent = await empty.dispatch(request({ operation: 'devices.capabilities', params: { device: 'absent' } }), context)
  assert.equal(absent.error.code, 'NOT_FOUND')
  assert.equal('data' in missing, false)
})

test('unexpected backend errors are sanitized and error exit codes remain machine-readable', async () => {
  const { createAutomationService } = load('src/main/automation/service.ts')
  const { exitCode } = load('src/common/automation/protocol.ts')
  const service = createAutomationService({ instanceId: 'test', version: 'test', discover: async () => { throw Error('private-device-secret') } })
  const result = await service.dispatch(request(), { clientId: 'cli-test', deadline: Date.now() + 1000, signal: new AbortController().signal })
  assert.equal(result.ok, false)
  assert.equal(JSON.stringify(result).includes('private-device-secret'), false)
  for (const [code, expected] of [['INVALID_ARGUMENT',2], ['VERSION_MISMATCH',2], ['UNSUPPORTED',3], ['NOT_FOUND',4], ['UNAVAILABLE',4], ['BUSY',4], ['UNAUTHORIZED',5], ['TIMEOUT',6], ['OUTCOME_UNKNOWN',7], ['INTERNAL',7], ['CANCELLED',130]]) assert.equal(exitCode({ ok: false, error: { code } }), expected)
})
