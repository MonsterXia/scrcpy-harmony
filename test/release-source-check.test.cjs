const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')

// Exercise the actual CLI, replacing only compilation/network and filesystem I/O.
async function run({ version = '1.0.5-dev.2', available = false, expected = { stable: { version: '1.0.4', updateAvailable: false }, prerelease: { version: '1.0.5-dev.2', updateAvailable: false } } } = {}) {
  let report
  const process = { argv: ['node', 'script/check-release-source.mjs', 'expected.json'], exitCode: 0 }
  class AppUpdater { async isUpdateAvailable() { return available } }
  class ReleaseProvider {
    constructor(_, updater) { this.beta = updater.allowPrerelease }
    async getLatestVersion() { return { version: this.beta ? version : '1.0.4', tag: this.beta ? `v${version}` : 'v1.0.4' } }
    resolveFiles(info) { return [{ url: new URL(`https://github.com/MonsterXia/scrcpy-plus/releases/download/${info.tag}/app.dmg`) }] }
  }
  const requireFixture = id => id.endsWith('package.json') ? { publish: { owner: 'MonsterXia', repo: 'scrcpy-plus' }, version: '1.0.5-dev.2' }
    : id.includes('AppUpdater') ? { AppUpdater } : { httpExecutor: {} }
  const source = fs.readFileSync('script/check-release-source.mjs', 'utf8').replace(/^import .*$/gm, '')
  await vm.runInNewContext(`(async () => { ${source} })()`, {
    createRequire: () => requireFixture,
    build: async () => ({ outputFiles: [{ text: '' }] }),
    vm: { runInNewContext: (_, context) => { context.module.exports.ReleaseProvider = ReleaseProvider } },
    readFile: async () => JSON.stringify(expected), mkdir: async () => {},
    writeFile: async (_, text) => { report = JSON.parse(text) },
    path, assert, process, URL, setTimeout, clearTimeout, console: { log() {} },
  })
  return { report, code: process.exitCode }
}

test('online verification accepts six scenarios matching explicit expectations', async () => {
  const { report, code } = await run()
  assert.equal(code, 0)
  assert.equal(report.passed, true)
  assert.equal(report.scenarios.length, 6)
})
for (const [name, options] of [
  ['wrong version', { version: '1.0.5-dev.1' }],
  ['wrong update availability', { available: true }],
  ['missing expected version', { expected: { stable: { updateAvailable: false } } }],
]) {
  test(`online verification fails for ${name} even with valid new-repository asset URLs`, async () => {
    const { report, code } = await run(options)
    assert.equal(code, 1)
    assert.equal(report.passed, false)
    assert.ok(report.error)
  })
}
