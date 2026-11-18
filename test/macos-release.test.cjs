const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')

const details = 'Authority=Developer ID Application: Test (TESTTEAM01)\nTeamIdentifier=TESTTEAM01\nTimestamp=now\nflags=0x10000(runtime)'

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-release-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'App with spaces.dmg')
  await fs.writeFile(file, 'original disk image')
  return { root, file, event: { file, updateInfo: { size: 19, sha512: 'old' } } }
}

test('DMG stapling refreshes blockmap and emitted update digest from final bytes', async t => {
  const { finalizeMacArtifact } = await import('../script/lib/macos-release.mjs')
  const { file, event } = await fixture(t)
  const run = async (command, args) => {
    if (command === 'codesign' && args.includes('-dvvv')) return details
    if (args.includes('submit')) return JSON.stringify({ id: 'submission', status: 'Accepted' })
    if (args.includes('staple')) await fs.appendFile(file, ' + ticket')
    return ''
  }
  await finalizeMacArtifact(event, { run, profile: 'fixture', teamId: 'TESTTEAM01' })
  const bytes = await fs.readFile(file)
  assert.equal(bytes.toString(), 'original disk image + ticket')
  assert.equal(event.updateInfo.size, 28)
  assert.equal(event.updateInfo.sha512, crypto.createHash('sha512').update(bytes).digest('base64'))
  const map = JSON.parse(zlib.gunzipSync(await fs.readFile(file + '.blockmap')))
  assert.equal(map.files[0].sizes.reduce((a, b) => a + b, 0), 28)
  assert.equal(map.files[0].checksums.length, map.files[0].sizes.length)
})

for (const status of ['Invalid', 'In Progress']) {
  test(`notarization ${status} prevents metadata finalization`, async t => {
    const { finalizeMacArtifact } = await import('../script/lib/macos-release.mjs')
    const { file, event } = await fixture(t)
    const run = async (command, args) => args.includes('submit') ? JSON.stringify({ status }) : details
    await assert.rejects(finalizeMacArtifact(event, { run, profile: 'fixture', teamId: 'TESTTEAM01' }), /not accepted/)
    assert.equal(event.updateInfo.sha512, 'old')
    assert.equal(await fs.readFile(file, 'utf8'), 'original disk image')
    await assert.rejects(fs.access(file + '.blockmap'))
  })
}

test('Gatekeeper failure prevents final artifact metadata', async t => {
  const { finalizeMacArtifact } = await import('../script/lib/macos-release.mjs')
  const { event } = await fixture(t)
  const run = async (command, args) => {
    if (command === 'spctl') throw new Error('Gatekeeper rejected')
    return args.includes('submit') ? JSON.stringify({ status: 'Accepted' }) : details
  }
  await assert.rejects(finalizeMacArtifact(event, { run, profile: 'fixture', teamId: 'TESTTEAM01' }), /Gatekeeper rejected/)
  assert.equal(event.updateInfo.sha512, 'old')
})

test('ad-hoc and foreign-team signatures fail trusted-artifact validation', async () => {
  const { verifyTrustedMacArtifact } = await import('../script/lib/macos-release.mjs')
  for (const signature of ['Signature=adhoc', details.replaceAll('TESTTEAM01', 'OTHERTEAM1')]) {
    await assert.rejects(verifyTrustedMacArtifact('/fixture.app', {
      teamId: 'TESTTEAM01', run: async () => signature,
    }), /Developer ID|team/)
  }
})

test('auxiliary artifact events do not invoke Apple services', async () => {
  const { finalizeMacArtifact } = await import('../script/lib/macos-release.mjs')
  await finalizeMacArtifact({ file: '/fixture.dmg.blockmap' }, {
    run: async () => { throw new Error('Apple service called for a blockmap') },
  })
})

test('release metadata verification rejects a stale hash and a stale blockmap', async t => {
  const { verifyMacUpdateMetadata } = await import('../script/lib/macos-release.mjs')
  const { buildBlockMap } = await import('app-builder-lib/out/targets/blockmap/blockmap.js')
  const { root, file } = await fixture(t)
  await buildBlockMap(file, 'gzip', file + '.blockmap')
  const writeMetadata = async digest => fs.writeFile(path.join(root, 'latest-mac.yml'),
    `version: 1.2.3\nfiles:\n  - url: App-with-spaces.dmg\n    sha512: ${digest}\n    size: 19\npath: App-with-spaces.dmg\nsha512: ${digest}\n`)
  await writeMetadata('stale')
  await assert.rejects(verifyMacUpdateMetadata(file, '1.2.3'), /hash/)
  const digest = crypto.createHash('sha512').update(await fs.readFile(file)).digest('base64')
  await writeMetadata(digest)
  await verifyMacUpdateMetadata(file, '1.2.3')
  await fs.writeFile(file + '.blockmap', 'stale blockmap')
  await assert.rejects(verifyMacUpdateMetadata(file, '1.2.3'), /blockmap/)
})
