const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

for (const [argv, publish] of [[[], 'never'], [['--publish'], 'always'], [['--no-publish'], 'never'], [['--publish', '--no-publish'], 'never']]) {
  test(`pack ${argv.join(' ')} emits the Plus target with publish=${publish}`, async () => {
    let options
    const source = fs.readFileSync('script/pack.mjs', 'utf8').replace(/^import .*$/gm, '')
    await vm.runInNewContext(`(async () => { ${source} })()`, {
      macReleaseConfig: (await import('../script/lib/macos-release.mjs')).macReleaseConfig,
      cd: directory => assert.equal(directory, 'dist'),
      fs: { readJson: async () => require('../package.json') },
      path: require('node:path'),
      isMac: true, process: { argv, arch: 'arm64', env: {} },
      builder: { build: async value => { options = value } },
    })
    assert.equal(options.config.mac.icon, 'mac-icon/icon.icns')
    assert.equal(options.config.mac.extendInfo.CFBundleIconName, 'Icon')
    assert.equal(options.publish, publish)
    assert.equal(options.config.publish.provider, 'github')
    assert.equal(options.config.publish.owner, 'MonsterXia')
    assert.equal(options.config.publish.repo, 'scrcpy-plus')
    assert.equal(options.config.publish.channel, 'latest')
    assert.equal(options.config.appId, 'io.scrcpyplus.desktop')
  })
}

async function releasePack(argv, env = {}, platform = 'darwin') {
  let options
  const source = fs.readFileSync('script/pack.mjs', 'utf8').replace(/^import .*$/gm, '')
  await vm.runInNewContext(`(async () => { ${source} })()`, {
    macReleaseConfig: (await import('../script/lib/macos-release.mjs')).macReleaseConfig,
    cd() {}, fs: { readJson: async () => require('../package.json') },
    path: require('node:path'), isMac: platform === 'darwin',
    process: { argv, arch: 'arm64', platform, env },
    builder: { build: async value => { options = value } },
  })
  return options
}

test('release packaging refuses missing signing and notarization credentials', async () => {
  await assert.rejects(releasePack(['--release']), /APPLE_KEYCHAIN_PROFILE/)
})

test('release packaging cannot opt into ad-hoc signing or immediate publishing', async () => {
  for (const flag of ['--adhoc-sign', '--publish']) {
    await assert.rejects(releasePack(['--release', flag]), /incompatible/)
  }
})

test('ordinary PR packaging stays ad-hoc without release hooks', async () => {
  const { config } = await releasePack(['--no-publish', '--adhoc-sign'])
  assert.equal(config.mac.identity, '-')
  assert.equal(config.mac.notarize, false)
  assert.equal(config.artifactBuildCompleted, undefined)
  assert.equal(config.forceCodeSigning, undefined)
})

test('release packaging requires Developer ID, notarization and DMG finalization', async () => {
  const { config, publish } = await releasePack(['--no-publish', '--release'], {
    APPLE_KEYCHAIN_PROFILE: 'test-profile', APPLE_TEAM_ID: 'TESTTEAM01', CSC_LINK: 'fixture.p12',
  })
  assert.equal(config.forceCodeSigning, true)
  assert.equal(config.mac.type, 'distribution')
  assert.equal(config.mac.hardenedRuntime, true)
  assert.equal(config.mac.notarize, true)
  assert.equal(config.dmg.sign, true)
  assert.equal(typeof config.afterSign, 'function')
  assert.equal(typeof config.artifactBuildCompleted, 'function')
  assert.equal(publish, 'never')
})
