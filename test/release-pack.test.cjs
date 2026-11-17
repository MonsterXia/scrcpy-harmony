const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

for (const [argv, publish] of [[[], 'never'], [['--publish'], 'always'], [['--no-publish'], 'never'], [['--publish', '--no-publish'], 'never']]) {
  test(`pack ${argv.join(' ')} emits the Plus target with publish=${publish}`, async () => {
    let options
    const source = fs.readFileSync('script/pack.mjs', 'utf8').replace(/^import .*$/gm, '')
    await vm.runInNewContext(`(async () => { ${source} })()`, {
      cd: directory => assert.equal(directory, 'dist'),
      fs: { readJson: async () => require('../package.json') },
      isMac: true, process: { argv, arch: 'arm64' },
      builder: { build: async value => { options = value } },
    })
    assert.equal(options.publish, publish)
    assert.equal(options.config.publish.provider, 'github')
    assert.equal(options.config.publish.owner, 'MonsterXia')
    assert.equal(options.config.publish.repo, 'scrcpy-plus')
    assert.equal(options.config.publish.channel, 'latest')
    assert.equal(options.config.appId, 'io.scrcpyplus.desktop')
  })
}
