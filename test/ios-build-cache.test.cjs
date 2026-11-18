const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-build-cache-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), value)
  }
  return { root, write }
}

test('WDA patch upgrades use a new source cache and preserve legacy or edited source', t => {
  const { root, write } = fixture(t)
  write('script/ios-wda.mjs', fs.readFileSync('script/ios-wda.mjs'))
  const commit = 'a'.repeat(40), sourceName = 'WebDriverAgent-' + commit
  write(`archive/${sourceName}/WebDriverAgent.xcodeproj/project.pbxproj`, 'project')
  write(`archive/${sourceName}/socket.m`, 'loopback-old\n')
  write(`archive/${sourceName}/session.m`, 'original\n')
  write(`build/ios-wda/${sourceName}/WebDriverAgent.xcodeproj/project.pbxproj`, 'legacy project')
  write(`build/ios-wda/${sourceName}/socket.m`, 'user edits must survive')
  const archive = path.join(root, `build/ios-wda/${commit}.tar.gz`)
  const tar = spawnSync('tar', ['-czf', archive, '-C', path.join(root, 'archive'), sourceName], { encoding: 'utf8' })
  assert.equal(tar.status, 0, tar.stderr)
  const manifest = {
    commit, archive: 'https://invalid.example/no-network', sha256: hash(fs.readFileSync(archive)),
    localPatch: { file: 'socket.m', find: 'loopback-old', replace: 'loopback-new', sha256: hash('loopback-old\n'), patchedSha256: hash('loopback-new\n') },
  }
  function prepare(version) {
    const patch = `--- a/session.m\n+++ b/session.m\n@@ -1 +1 @@\n-original\n+${version}\n`
    write('vendor/ios-wda/session.patch', patch)
    manifest.sessionOwnershipPatch = { file: 'session.patch', target: 'session.m', sha256: hash(patch), sourceSha256: hash('original\n'), patchedSha256: hash(version + '\n') }
    write('vendor/ios-wda/manifest.json', JSON.stringify(manifest))
    return spawnSync(process.execPath, ['script/ios-wda.mjs', 'fetch'], { cwd: root, encoding: 'utf8' })
  }
  const first = prepare('version-one')
  assert.equal(first.status, 0, first.stderr)
  const firstSource = first.stdout.trim().split('\n').at(-1)
  assert.equal(fs.readFileSync(path.join(firstSource, 'session.m'), 'utf8'), 'version-one\n')
  const second = prepare('version-two')
  assert.equal(second.status, 0, second.stderr)
  const secondSource = second.stdout.trim().split('\n').at(-1)
  assert.notEqual(secondSource, firstSource)
  assert.equal(fs.readFileSync(path.join(secondSource, 'session.m'), 'utf8'), 'version-two\n')
  assert.equal(fs.readFileSync(path.join(firstSource, 'session.m'), 'utf8'), 'version-one\n')
  assert.equal(fs.readFileSync(path.join(root, `build/ios-wda/${sourceName}/socket.m`), 'utf8'), 'user edits must survive')
  fs.writeFileSync(path.join(secondSource, 'session.m'), 'unknown edits')
  const edited = prepare('version-two')
  assert.notEqual(edited.status, 0)
  assert.match(edited.stderr, /Unexpected WDA source/)
  assert.equal(fs.readFileSync(path.join(secondSource, 'session.m'), 'utf8'), 'unknown edits')
})

test('provisioning refreshes an existing default unsigned app before packaging it', t => {
  const { root, write } = fixture(t)
  write('script/build-ios-provisioning.mjs', fs.readFileSync('script/build-ios-provisioning.mjs'))
  const app = 'build/ios-wda/unsigned/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app'
  write(app, 'previous Runner')
  // Only the expensive/external compilation boundary is replaced. Real build
  // orchestration, filesystem, packaging selection and cache hashing execute.
  write('script/ios-wda.mjs', `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(app)}, 'current Runner')`)
  write('native/ios-device/package_wda.py', "require('node:fs').copyFileSync(process.argv[2], process.argv[3])")
  for (const file of ['native/ios-sign/Cargo.toml', 'native/ios-sign/Cargo.lock', 'native/ios-sign/src/main.rs', 'native/ios-device/device.py', 'native/ios-device/requirements.lock', 'native/ios-device/validate_ipa.py', 'native/ios-device/notices.py', 'vendor/ios-wda/manifest.json', 'vendor/ios-wda/session-ownership.patch']) write(file, 'fixture')
  write('preload.cjs', `const cp = require('node:child_process'); const real = cp.spawnSync;
    cp.spawnSync = (file, args, options) => file === 'cargo' ? {status: 23} : real(file, args, options);
    require('node:module').syncBuiltinESMExports(); Object.defineProperty(process, 'platform', {value:'darwin'});`)
  const env = { ...process.env, IOS_PYTHON: process.execPath }
  delete env.IOS_WDA_APP; delete env.IOS_WDA_IPA
  const result = spawnSync(process.execPath, ['--require', './preload.cjs', 'script/build-ios-provisioning.mjs'], { cwd: root, env, encoding: 'utf8' })
  assert.match(result.stderr, /cargo failed/)
  assert.equal(fs.readFileSync(path.join(root, 'build/ios-provisioning/WDA.ipa'), 'utf8'), 'current Runner')
})

test('provisioning manifest hashes framework files without reading directory symlinks', t => {
  if (process.platform === 'win32') return t.skip('macOS framework symlink layout')
  const { root, write } = fixture(t)
  write('script/build-ios-provisioning.mjs', fs.readFileSync('script/build-ios-provisioning.mjs'))
  for (const file of ['native/ios-sign/Cargo.toml', 'native/ios-sign/Cargo.lock', 'native/ios-sign/src/main.rs', 'native/ios-device/device.py', 'native/ios-device/requirements.lock', 'native/ios-device/package_wda.py', 'native/ios-device/validate_ipa.py', 'native/ios-device/notices.py', 'script/ios-wda.mjs', 'vendor/ios-wda/session-ownership.patch', 'vendor/ios-wda/LICENSE']) write(file, 'fixture')
  write('vendor/ios-wda/manifest.json', JSON.stringify({ commit: 'fixture' }))
  write('input.ipa', 'unsigned Runner')
  write('native/ios-sign/target/release/scrcpy-plus-ios-sign', 'signer')
  write('build/ios-provisioning/venv/bin/python', 'python')
  const frozen = 'build/ios-provisioning/frozen/ios-device'
  write(frozen + '/ios-device', 'helper')
  write(frozen + '/_internal/Python.framework/Versions/3.13/Python', 'runtime')
  fs.symlinkSync('3.13', path.join(root, frozen, '_internal/Python.framework/Versions/Current'))
  fs.symlinkSync('Versions/Current/Python', path.join(root, frozen, '_internal/Python.framework/Python'))
  write('preload.cjs', `const cp = require('node:child_process');
    cp.spawnSync = (file, args) => { if (file === 'cargo') console.log('cargo invoked'); return {status:0, stdout:JSON.stringify({packages:[]})} };
    require('node:module').syncBuiltinESMExports(); Object.defineProperty(process, 'platform', {value:'darwin'});`)
  const build = () => spawnSync(process.execPath, ['--require', './preload.cjs', 'script/build-ios-provisioning.mjs'], { cwd: root, env: { ...process.env, IOS_WDA_IPA: path.join(root, 'input.ipa') }, encoding: 'utf8' })
  const first = build()
  assert.equal(first.status, 0, first.stderr)
  const output = path.join(root, 'resources/ios-provisioning')
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')))
  assert.ok(manifest.files.some(e => e.file.endsWith('Versions/3.13/Python') && e.sha256 === hash('runtime')))
  assert.equal(fs.readlinkSync(path.join(output, 'device/_internal/Python.framework/Versions/Current')), '3.13')
  const cached = build()
  assert.equal(cached.status, 0, cached.stderr)
  assert.match(cached.stdout, /already current/)
  assert.doesNotMatch(cached.stdout, /cargo invoked/)
  fs.writeFileSync(path.join(output, 'device/_internal/Python.framework/Versions/3.13/Python'), 'corrupt')
  const repaired = build()
  assert.equal(repaired.status, 0, repaired.stderr)
  assert.match(repaired.stdout, /cargo invoked/)
  assert.equal(fs.readFileSync(path.join(output, 'device/_internal/Python.framework/Python'), 'utf8'), 'runtime')
})
