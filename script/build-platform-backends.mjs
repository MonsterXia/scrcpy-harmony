import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { buildAndroidServer } from './lib/android-server-build.mjs'

const root = process.cwd()
const android = !process.argv.includes('--airplay')
const airplay = !process.argv.includes('--android')
let manifest = {}
try { manifest = JSON.parse(await fs.readFile('resources/platform-backends.json', 'utf8')) } catch { /* first build */ }
const digest = async file => {
  const bytes = await fs.readFile(file)
  return { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
function run(file, args, options = {}) { execFileSync(file, args, { stdio: 'inherit', ...options }) }
if (android) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk')
  const source = JSON.parse(await fs.readFile('vendor/scrcpy-server/SOURCE.json', 'utf8'))
  const serverScript = await fs.readFile('vendor/scrcpy-server/server/build_without_gradle.sh', 'utf8')
  if (source.version !== '3.3.3' || !serverScript.includes('SCRCPY_VERSION_NAME=3.3.3')) throw new Error('Android server source version mismatch')
  const tools = process.env.ANDROID_BUILD_TOOLS || '35.0.0'
  const platform = process.env.ANDROID_PLATFORM || '35'
  const build = path.join(root, 'build/android-server')
  await buildAndroidServer({ root, sdk, tools, platform })
  await fs.mkdir('resources/android', { recursive: true })
  await fs.copyFile(path.join(build, 'scrcpy-server'), 'resources/android/scrcpy-server')
  await fs.copyFile('vendor/scrcpy-server/SOURCE.json', 'resources/android/SOURCE.json')
  await fs.copyFile('vendor/scrcpy-server/LICENSE', 'resources/android/LICENSE')
  manifest.android = { version: source.version, sourceCommit: source.commit, ...await digest('resources/android/scrcpy-server') }
}
if (airplay) {
  const nodeHeaders = process.env.NODE_INCLUDE_DIR || path.resolve(path.dirname(process.execPath), '../include/node')
  if (!existsSync(path.join(nodeHeaders, 'node_api.h'))) throw new Error('Set NODE_INCLUDE_DIR to the Node headers directory')
  let cmake = process.env.CMAKE || 'cmake'
  if (!process.env.CMAKE) {
    const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk')
    const directory = path.join(sdk, 'cmake')
    if (existsSync(directory)) {
      const versions = (await fs.readdir(directory)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      if (versions.length) cmake = path.join(directory, versions[0], 'bin', process.platform === 'win32' ? 'cmake.exe' : 'cmake')
    }
  }
  const args = ['-S', 'native/airplay', '-B', 'build/native-airplay', `-DNODE_INCLUDE_DIR=${nodeHeaders}`,
    '-UOPENSSL_CRYPTO_LIBRARY', '-UOPENSSL_SSL_LIBRARY', '-DOPENSSL_USE_STATIC_LIBS=TRUE']
  const openssl = process.env.OPENSSL_ROOT_DIR || (process.platform === 'darwin'
    ? ['/opt/homebrew/opt/openssl@3', '/usr/local/opt/openssl@3'].find(existsSync) : undefined)
  if (openssl) args.push(`-DOPENSSL_ROOT_DIR=${openssl}`)
  if (process.platform === 'darwin') args.push('-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0')
  if (process.env.NODE_LIBRARY) args.push(`-DNODE_LIBRARY=${process.env.NODE_LIBRARY}`)
  if (process.platform === 'win32') args.push('-G', 'MinGW Makefiles')
  run(cmake, args)
  run(cmake, ['--build', 'build/native-airplay', '--parallel', '4'])
  await fs.mkdir('resources/airplay', { recursive: true })
  await fs.copyFile('build/native-airplay/plus_airplay.node', 'resources/airplay/plus_airplay.node')
  manifest.airplay = { platform: process.platform, arch: process.arch, napi: 8, ...await digest('resources/airplay/plus_airplay.node') }
}
await fs.writeFile('resources/platform-backends.json', JSON.stringify(manifest, null, 2) + '\n')
console.log('Source-built platform backends ready')
