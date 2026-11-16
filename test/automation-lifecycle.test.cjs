const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const load = require('./helpers/load-automation.cjs')

test('quit waits for in-flight service startup then closes it exactly once', async () => {
  const { attachAutomationLifecycle } = load('src/main/automation/lifecycle.ts')
  const app = new EventEmitter(); let resolveStart, closes = 0, quits = 0, prevented = 0
  app.quit = () => { quits++; app.emit('before-quit', { preventDefault() { prevented++ } }) }
  const pending = new Promise(resolve => { resolveStart = resolve })
  const lifecycle = attachAutomationLifecycle(app, () => pending, () => {})
  app.emit('before-quit', { preventDefault() { prevented++ } })
  resolveStart({ close: async () => { closes++ } })
  await lifecycle.stopped()
  assert.equal(closes, 1); assert.equal(quits, 1); assert.equal(prevented, 1)
})
test('service startup failure does not prevent GUI shutdown and diagnostics omit secrets', async () => {
  const { attachAutomationLifecycle } = load('src/main/automation/lifecycle.ts')
  const app = new EventEmitter(); let quits = 0; const errors = []
  app.quit = () => { quits++ }
  const lifecycle = attachAutomationLifecycle(app, async () => { throw Error('secret-from-host') }, code => errors.push(code))
  await lifecycle.ready
  app.emit('before-quit', { preventDefault() {} }); await lifecycle.stopped()
  assert.equal(quits, 1); assert.deepEqual(errors, ['AUTOMATION_START_FAILED'])
})
