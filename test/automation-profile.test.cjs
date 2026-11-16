const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const load = require('./helpers/load-automation.cjs')
test('explicit profile is configured before application startup and relative profiles fail', t => {
  const previous = process.env.SCRCPY_PLUS_PROFILE
  t.after(() => { if (previous === undefined) delete process.env.SCRCPY_PLUS_PROFILE; else process.env.SCRCPY_PLUS_PROFILE = previous })
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plus-profile-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const calls = []
  const app = { setName: name => calls.push(['name', name]), setPath: (name, value) => calls.push([name, value]) }
  process.env.SCRCPY_PLUS_PROFILE = path.join(directory, '测试 profile')
  load('src/main/automation/profile.ts', { electron: { app } })
  assert.deepEqual(calls, [['name', 'Scrcpy Plus'], ['userData', process.env.SCRCPY_PLUS_PROFILE]])
  assert.equal(fs.statSync(process.env.SCRCPY_PLUS_PROFILE).isDirectory(), true)
  process.env.SCRCPY_PLUS_PROFILE = 'relative-profile'
  assert.throws(() => load('src/main/automation/profile.ts', { electron: { app } }), /absolute/)
})
