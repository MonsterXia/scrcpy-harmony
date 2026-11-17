// Read-only verification of the production provider against public GitHub Releases.
// Usage: node script/check-release-source.mjs [report.json]
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
const require = createRequire(path.resolve('package.json'))
const { AppUpdater } = require('electron-updater/out/AppUpdater')
const { httpExecutor } = require('builder-util/out/nodeHttpExecutor')
const pkg = require('./package.json')
const compiled = await build({ entryPoints: ['src/main/lib/ReleaseProvider.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', write: false })
const module = { exports: {} }
vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require, URL, setTimeout, clearTimeout })
const report = { repository: `${pkg.publish.owner}/${pkg.publish.repo}`, current: pkg.version, checkedAt: new Date().toISOString(), scenarios: [], passed: false }
try {
  for (const [platform, channel] of [['win32', 'latest'], ['darwin', 'latest'], ['darwin', 'latest-x64']]) {
    for (const beta of [false, true]) {
      const updater = new AppUpdater(undefined, { version: pkg.version, isPackaged: false })
      updater.channel = channel
      updater.allowPrerelease = beta
      updater.allowDowngrade = false
      const requests = []
      const provider = new module.exports.ReleaseProvider({}, updater, { platform, isUseMultipleRangeRequest: false, executor: {
        request(options, token) {
          requests.push(`${options.hostname}${options.path}`)
          return httpExecutor.request({ ...options, headers: { ...options.headers, 'User-Agent': 'scrcpy-plus-release-verification' } }, token)
        },
      } })
      const info = await provider.getLatestVersion()
      const files = provider.resolveFiles(info).map(file => file.url.href)
      assert.ok(files.length > 0)
      assert.ok(files.every(url => url.startsWith(`https://github.com/${report.repository}/releases/download/`)))
      report.scenarios.push({ platform, channel, beta, version: info.version, tag: info.tag, updateAvailable: await updater.isUpdateAvailable(info), files, requests })
    }
  }
  report.passed = true
} catch (error) {
  report.error = String(error.stack || error)
  process.exitCode = 1
} finally {
  const destination = path.resolve(process.argv[2] || 'release/release-source-check.json')
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
