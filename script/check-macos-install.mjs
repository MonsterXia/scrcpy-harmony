import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { verifyTrustedMacArtifact, verifyMacUpdateMetadata } from './lib/macos-release.mjs'

assert.ok(
  process.platform === 'darwin' && process.env.GITHUB_ACTIONS === 'true' &&
  process.env.RUNNER_ENVIRONMENT === 'github-hosted',
  'DMG installation checks require a disposable GitHub-hosted macOS runner'
)
assert.equal(process.arch, process.env.EXPECTED_ARCH, 'Unexpected runner architecture')
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)))
const dmg = path.resolve('release', pkg.version,
  `${pkg.productName}-${pkg.version}-mac-${process.arch}.dmg`)
assert.ok((await stat(dmg)).size > 0, 'DMG is empty')
const temporaryRoot = await realpath(process.env.RUNNER_TEMP)
const root = await mkdtemp(path.join(temporaryRoot, 'scrcpy-harmony-dmg-'))
const mountPoint = path.join(root, 'volume')
const application = path.join(root, 'Installed Apps', `${pkg.productName}.app`)
const resources = path.join(application, 'Contents/Resources')
const executable = path.join(application, 'Contents/MacOS', pkg.productName)
const hdc = path.join(resources, 'hdc/hdc')
await mkdir(mountPoint)
let mounted = false

function run(command, args, timeout = 60_000) {
  return execFileSync(command, args, { stdio: 'inherit', timeout })
}

try {
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountPoint, dmg])
  mounted = true
  // Test the application delivered in the DMG, not electron-builder's staging app.
  run('ditto', [path.join(mountPoint, `${pkg.productName}.app`), application])
  run('hdiutil', ['detach', mountPoint])
  mounted = false
  for (const file of [executable, path.join(application, 'Contents/Info.plist'),
    path.join(resources, 'app.asar'), hdc,
    path.join(resources, 'uitestkit_sdk/uitest_agent_v1.1.0.so')]) {
    assert.ok((await stat(file)).size > 0, `Missing or empty installed file: ${file}`)
  }
  for (const name of ['Assets.car', 'icon.icns']) {
    assert.ok((await readFile(path.join(resources, name))).equals(await readFile(path.join('build/mac-icon', name))),
      `Installed icon differs from the verified resource: ${name}`)
  }
  assert.equal(execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIconName',
    path.join(application, 'Contents/Info.plist')], { encoding: 'utf8' }).trim(), 'Icon')
  await access(executable, constants.X_OK)
  await access(hdc, constants.X_OK)
  // Verify the copied DMG payload, not just the staging bundle. Ad-hoc is
  // acceptable here; Developer ID/Gatekeeper/notarization are separate checks.
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', application])
  let releaseMetadata
  if (process.argv.includes('--release')) {
    const options = { teamId: process.env.APPLE_TEAM_ID }
    assert.match(options.teamId || '', /^[A-Z0-9]{10}$/, 'APPLE_TEAM_ID required for release verification')
    await verifyTrustedMacArtifact(application, options)
    await verifyTrustedMacArtifact(dmg, { ...options, kind: 'dmg' })
    releaseMetadata = await verifyMacUpdateMetadata(dmg, pkg.version)
  }
  run(process.execPath, ['script/smoke-app.mjs', executable], 120_000)
  if (releaseMetadata) {
    await writeFile(path.join(path.dirname(dmg), `verification-mac-${process.arch}.json`), JSON.stringify({
      sourceCommit: process.env.GITHUB_SHA,
      runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      installer: path.basename(dmg), version: pkg.version, architecture: process.arch,
      teamId: process.env.APPLE_TEAM_ID, ...releaseMetadata,
      developerIdSignature: 'passed', appNotarization: 'passed', dmgNotarization: 'passed',
      gatekeeper: 'passed', installationAndStartup: 'passed',
    }, null, 2) + '\n')
  }
} finally {
  try {
    // The hosted runner is disposable and has no user's HDC sessions.
    try {
      await access(hdc, constants.X_OK)
      run(hdc, ['kill'], 10_000)
    } catch (error) {
      console.warn('HDC cleanup:', error.message)
    }
  } finally {
    if (mounted) run('hdiutil', ['detach', mountPoint], 30_000)
  }
}
