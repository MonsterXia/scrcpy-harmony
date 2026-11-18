import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const help = `Prepare the pinned Scrcpy Plus iOS WDA + ReplayKit runner (macOS/Xcode).

  npm run ios:wda -- fetch
  npm run ios:wda -- build --unsigned
  npm run ios:wda -- run --udid <UDID> --team <TEAM_ID> [--allow-provisioning]

Options: --bundle-id <reverse.dns.WebDriverAgentRunner>, --xcode <Developer directory>
Run requires a trusted, unlocked iPhone with Developer Mode and a configured signing team.
Keep the test process running, then select the USB iPhone in Scrcpy Plus.
The script never changes xcode-select. --allow-provisioning explicitly allows Xcode to update profiles and register the selected device.
Unsigned builds verify compilation only and cannot be installed on a real iPhone.
`
export function parseOptions(args) {
  if (!args.length || args.includes('--help')) return { help: true }
  const [command, ...rest] = args
  if (!['fetch','build','run'].includes(command)) throw Error('Expected fetch, build or run')
  const options = { command }
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i]
    if (['--unsigned','--allow-provisioning'].includes(name)) { options[name.slice(2)] = true; continue }
    if (!['--udid','--team','--bundle-id','--xcode'].includes(name) || !rest[i+1] || rest[i+1].startsWith('--')) throw Error('Invalid WDA preparation option')
    options[name.slice(2)] = rest[++i]
  }
  if (options.udid && !/^[a-fA-F0-9-]{8,64}$/.test(options.udid)) throw Error('Invalid UDID')
  if (options.team && !/^[A-Z0-9]{10}$/.test(options.team)) throw Error('Invalid Apple Team ID')
  if (options['bundle-id'] && !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+\.WebDriverAgentRunner$/.test(options['bundle-id'])) throw Error('Bundle ID must end in .WebDriverAgentRunner')
  if (command === 'run' && (!options.udid || options.unsigned)) throw Error('Run requires --udid and a signed build')
  if (command !== 'fetch' && !options.unsigned && !options.team) throw Error('Provide --team for signing, or build --unsigned')
  if (options.unsigned && (options.team || options['allow-provisioning'])) throw Error('Unsigned verification cannot request signing')
  return options
}
export function buildArguments(options, source, derived) {
  const args = ['-project', path.join(source, 'WebDriverAgent.xcodeproj'), '-scheme', 'WebDriverAgentRunner',
    '-configuration', 'Debug', '-derivedDataPath', derived, '-destination',
    options.udid ? `platform=iOS,id=${options.udid}` : 'generic/platform=iOS',
    'USE_PORT=8100', 'USE_IP=127.0.0.1',
    `WDA_PRODUCT_BUNDLE_IDENTIFIER=${options['bundle-id'] || `io.scrcpyplus.${(options.team || 'unsigned').toLowerCase()}.WebDriverAgentRunner`}`]
  if (options.unsigned) args.push('CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO')
  else args.push(`DEVELOPMENT_TEAM=${options.team}`, 'CODE_SIGN_STYLE=Automatic')
  if (options['allow-provisioning']) {
    args.push('-allowProvisioningUpdates')
    if (options.udid) args.push('-allowProvisioningDeviceRegistration')
  }
  args.push(options.command === 'run' ? 'test' : 'build-for-testing')
  return args
}
async function run(command, args, env = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env })
    const interrupt = () => child.kill('SIGINT')
    process.once('SIGINT', interrupt)
    child.once('error', error => { process.removeListener('SIGINT', interrupt); reject(error) })
    child.once('exit', code => { process.removeListener('SIGINT', interrupt); code === 0 ? resolve() : reject(Error(`${path.basename(command)} exited with ${code}`)) })
  })
}
export function patchSocketSource(text, patch) {
  const hash = value => createHash('sha256').update(value).digest('hex')
  if (hash(text) === patch.patchedSha256) return text
  if (hash(text) !== patch.sha256 || text.split(patch.find).length !== 2) throw Error('WDA socket source does not match pinned patch')
  const result = text.replace(patch.find, patch.replace)
  if (hash(result) !== patch.patchedSha256) throw Error('WDA patched socket checksum mismatch')
  return result
}
export async function applyOwnershipPatch(source, manifest) {
  const spec = manifest.sessionOwnershipPatch
  const target = path.join(source, spec.target)
  const patch = path.join(root, 'vendor/ios-wda', spec.file)
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  if (hash(await fs.readFile(patch)) !== spec.sha256) throw Error('WDA ownership patch checksum mismatch')
  const current = hash(await fs.readFile(target))
  if (current === spec.patchedSha256) return
  if (current !== spec.sourceSha256) throw Error('Unexpected WDA source; refusing to patch')
  await run('patch', ['--batch', '--forward', '-p1', '-d', source, '-i', patch])
  if (hash(await fs.readFile(target)) !== spec.patchedSha256) throw Error('WDA patched source checksum mismatch')
}
async function prepareSource() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'vendor/ios-wda/manifest.json'), 'utf8'))
  const cache = path.join(root, 'build/ios-wda')
  // A patch update can keep the upstream commit unchanged. Never patch over a
  // previous generation (or a developer's edits) just because that commit matches.
  const generation = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
  const sourceRoot = path.join(cache, 'sources', `${manifest.commit}-${generation}`)
  const source = path.join(sourceRoot, `WebDriverAgent-${manifest.commit}`)
  await fs.mkdir(cache, { recursive: true })
  const archive = path.join(cache, `${manifest.commit}.tar.gz`)
  let bytes
  try { bytes = await fs.readFile(archive) } catch {
    const response = await fetch(manifest.archive, { signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw Error(`WDA source download HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw Error('WDA source checksum mismatch')
  await fs.writeFile(archive, bytes)
  // The hash-pinned archive contains no mutable branch lookup or install script.
  try { await fs.access(path.join(source, 'WebDriverAgent.xcodeproj/project.pbxproj')) }
  catch {
    if (await fs.lstat(sourceRoot).catch(() => null)) throw Error('Incomplete WDA source cache; refusing to overwrite it')
    await fs.mkdir(path.dirname(sourceRoot), { recursive: true })
    const staging = await fs.mkdtemp(path.join(cache, 'extract-'))
    try {
      await run('tar', ['-xzf', archive, '-C', staging])
      await fs.access(path.join(staging, `WebDriverAgent-${manifest.commit}`, 'WebDriverAgent.xcodeproj/project.pbxproj'))
      await fs.rename(staging, sourceRoot)
    } finally { await fs.rm(staging, { recursive: true, force: true }) }
  }
  const socketFile = path.join(source, manifest.localPatch.file)
  const original = await fs.readFile(socketFile, 'utf8')
  const patched = patchSocketSource(original, manifest.localPatch)
  if (patched !== original) await fs.writeFile(socketFile, patched)
  await applyOwnershipPatch(source, manifest)
  return { source, cache }
}
async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) { process.stdout.write(help); return }
  if (process.platform !== 'darwin' && options.command !== 'fetch') throw Error('WDA source builds and signing require macOS/Xcode')
  const { source, cache } = await prepareSource()
  if (options.command === 'fetch') { process.stdout.write(`${source}\n`); return }
  const developer = options.xcode || process.env.DEVELOPER_DIR || '/Applications/Xcode.app/Contents/Developer'
  await fs.access(path.join(developer, 'usr/bin/xcodebuild'))
  await run(path.join(developer, 'usr/bin/xcodebuild'), buildArguments(options, source, path.join(cache, options.unsigned ? 'unsigned' : 'signed')), { ...process.env, DEVELOPER_DIR: developer })
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
