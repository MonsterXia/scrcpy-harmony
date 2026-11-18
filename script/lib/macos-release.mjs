import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'

export function runSigningCommand(command, args, timeout = 120_000) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 })
  const output = (result.stdout || '') + (result.stderr || '')
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || output}`)
  }
  return output
}

function verifyIdentity(details, teamId, app) {
  assert.match(details, /^Authority=Developer ID Application:/m, 'Developer ID Application signature required')
  assert.ok(details.split(/\r?\n/).includes(`TeamIdentifier=${teamId}`), 'Unexpected signing team')
  assert.match(details, /^Timestamp=.+/m, 'Secure signing timestamp required')
  if (app) assert.match(details, /flags=.*\bruntime\b/, 'Hardened Runtime required')
}

export async function verifyTrustedMacArtifact(file, { teamId, run = runSigningCommand, kind = 'app' }) {
  const app = kind === 'app'
  await run('codesign', ['--verify', ...(app ? ['--deep'] : []), '--strict', '--verbose=2', file])
  verifyIdentity(await run('codesign', ['-dvvv', file]), teamId, app)
  await run('xcrun', ['stapler', 'validate', file])
  await run('spctl', ['--assess', '--type', app ? 'execute' : 'open',
    ...(app ? [] : ['--context', 'context:primary-signature']), '--verbose=4', file])
}

export async function finalizeMacArtifact(event, { profile, keychain, teamId, run = runSigningCommand }) {
  if (!event.file?.endsWith('.dmg')) return
  const file = event.file
  verifyIdentity(await run('codesign', ['-dvvv', file]), teamId, false)
  const output = await run('xcrun', ['notarytool', 'submit', file,
    '--keychain-profile', profile, ...(keychain ? ['--keychain', keychain] : []),
    '--wait', '--timeout', '45m', '--output-format', 'json'], 50 * 60_000)
  const submission = JSON.parse(output)
  await writeFile(path.join(path.dirname(file), `verification-notary-mac-${process.arch}.json`),
    JSON.stringify(submission, null, 2) + '\n')
  assert.equal(submission.status, 'Accepted', `DMG notarization not accepted: ${submission.status}`)
  await run('xcrun', ['stapler', 'staple', file])
  await verifyTrustedMacArtifact(file, { teamId, run, kind: 'dmg' })
  // DmgTarget generated an initial blockmap before this hook. Stapling changes
  // the DMG bytes: replace both it and the event consumed by PublishManager.
  // Release mode never publishes during packaging, so no stale blockmap uploads.
  event.updateInfo = await buildBlockMap(file, 'gzip', `${file}.blockmap`)
}

export async function verifyMacUpdateMetadata(file, version) {
  const directory = path.dirname(file)
  const names = (await readdir(directory)).filter(name => name.endsWith('-mac.yml'))
  assert.ok(names.length > 0, 'Missing macOS update metadata')
  const bytes = await readFile(file)
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  const artifactName = path.basename(file).replaceAll(' ', '-')
  for (const name of names) {
    const metadata = yaml.load(await readFile(path.join(directory, name), 'utf8'))
    assert.equal(metadata.version, version, 'Update metadata version mismatch')
    const entry = metadata.files?.find(item => item.url === artifactName)
    assert.ok(entry, `Missing DMG entry in ${name}`)
    assert.equal(entry.sha512, sha512, 'Update metadata hash mismatch')
    assert.equal(entry.size, bytes.length, 'Update metadata size mismatch')
    assert.equal(metadata.path, artifactName, 'Legacy update metadata path mismatch')
    assert.equal(metadata.sha512, sha512, 'Legacy update metadata hash mismatch')
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'plus-blockmap-check-'))
  try {
    const expected = path.join(temporary, 'expected.blockmap')
    await buildBlockMap(file, 'gzip', expected)
    assert.ok((await readFile(`${file}.blockmap`)).equals(await readFile(expected)), 'Stale or corrupt DMG blockmap')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  return { sha256: createHash('sha256').update(bytes).digest('hex'), sha512, size: bytes.length, metadata: names }
}

export function macReleaseConfig({ argv, env, platform }) {
  if (!argv.includes('--release')) return {}
  assert.ok(!argv.includes('--adhoc-sign') && !argv.includes('--publish'), 'incompatible release flags')
  assert.equal(platform, 'darwin', 'Release signing requires macOS')
  assert.ok(env.APPLE_KEYCHAIN_PROFILE?.trim(), 'APPLE_KEYCHAIN_PROFILE is required')
  assert.match(env.APPLE_TEAM_ID || '', /^[A-Z0-9]{10}$/, 'APPLE_TEAM_ID is required')
  assert.ok(env.CSC_LINK?.trim() || env.CSC_NAME?.trim(), 'CSC_LINK or CSC_NAME is required')
  assert.notEqual(env.CSC_NAME, '-', 'Ad-hoc identity is incompatible with release signing')
  const options = { profile: env.APPLE_KEYCHAIN_PROFILE, keychain: env.APPLE_KEYCHAIN, teamId: env.APPLE_TEAM_ID }
  return {
    forceCodeSigning: true,
    mac: { type: 'distribution', hardenedRuntime: true, notarize: true },
    dmg: { sign: true },
    afterSign: async context => verifyTrustedMacArtifact(
      path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`), options),
    artifactBuildCompleted: event => finalizeMacArtifact(event, options),
  }
}
