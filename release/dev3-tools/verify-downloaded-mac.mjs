import assert from 'node:assert/strict'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readdir, readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import { verifyTrustedMacArtifact, verifyMacUpdateMetadata } from '../../script/lib/macos-release.mjs'

const [root, expectedCommit, runId] = process.argv.slice(2)
assert.ok(root && expectedCommit && runId)
const entries = await readdir(root, { recursive: true })
const dmgs = entries.filter(name => name.endsWith('.dmg'))
assert.equal(dmgs.length, 1)
const dmg = path.resolve(root, dmgs[0])
const directory = path.dirname(dmg)
const ci = JSON.parse(await readFile(path.join(directory, 'verification-mac-arm64.json')))
assert.equal(ci.sourceCommit, expectedCommit)
assert.equal(ci.runUrl, `https://github.com/MonsterXia/scrcpy-plus/actions/runs/${runId}`)
const options = { teamId: '2DMND6RL8D' }
await verifyTrustedMacArtifact(dmg, { ...options, kind: 'dmg' })
const metadata = await verifyMacUpdateMetadata(dmg, ci.version)
assert.equal(metadata.sha256, ci.sha256)
assert.equal(metadata.sha512, ci.sha512)
const temporary = await mkdtemp(path.join(os.tmpdir(), 'plus-ci-verification-'))
const volume = path.join(temporary, 'volume')
const application = path.join(temporary, 'Scrcpy Plus.app')
await mkdir(volume)
let mounted = false
function run(command, args) { return execFileSync(command, args, { encoding: 'utf8', timeout: 120000 }) }
try {
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', volume, dmg])
  mounted = true
  run('ditto', [path.join(volume, 'Scrcpy Plus.app'), application])
  run('hdiutil', ['detach', volume])
  mounted = false
  await verifyTrustedMacArtifact(application, options)
  const result = {
    checkedAt: new Date().toISOString(), runUrl: ci.runUrl, sourceCommit: ci.sourceCommit,
    version: ci.version, architecture: ci.architecture, installer: path.basename(dmg),
    ...metadata, teamId: options.teamId,
    ci: { developerIdSignature: ci.developerIdSignature, appNotarization: ci.appNotarization,
      dmgNotarization: ci.dmgNotarization, gatekeeper: ci.gatekeeper,
      installationAndStartup: ci.installationAndStartup },
    downloadedArtifact: { appSignature: 'passed', appTicket: 'passed', appGatekeeper: 'passed',
      dmgSignature: 'passed', dmgTicket: 'passed', dmgGatekeeper: 'passed', updateMetadata: 'passed', blockmap: 'passed' },
    scope: 'GitHub-hosted installed-app smoke; independent local downloaded artifact verification. No physical-device testing or public release.'
  }
  await writeFile(path.join(directory, 'download-verification.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
} finally {
  if (mounted) run('hdiutil', ['detach', volume])
  await rm(temporary, { recursive: true, force: true })
}
