import fs from 'fs-extra'
import { verifyIconSet } from './lib/app-icon-manifest.mjs'
import { execFileSync } from 'node:child_process'
import { vendorNotices } from './lib/vendor-notices.mjs'
import path from 'node:path'
import { validatePlatformBackends } from './platform-backend-resources.mjs'
import { validateNativeResources } from './native-video-resources.mjs'

const npmCli = process.env.npm_execpath
if (!npmCli) {
  throw new Error('Run this script with npm run build')
}

function runNpm(...args) {
  // Invoke npm's JS entry point directly: no Bash, cmd.exe or path quoting.
  execFileSync(process.execPath, [npmCli, ...args], { stdio: 'inherit' })
}

const pkg = await fs.readJson('package.json')
const electron = pkg.devDependencies.electron
delete pkg.devDependencies
pkg.devDependencies = {
  electron,
}
delete pkg.scripts
pkg.scripts = {
  start: 'electron main/index.js',
}
pkg.main = 'main/index.js'

const iconManifest = await fs.readJson('build/mac-icon/manifest.json')
await verifyIconSet(iconManifest)
runNpm('run', 'build:backends')
await validatePlatformBackends('resources')
runNpm('run', 'build:main')
runNpm('run', 'build:preload')
runNpm('run', 'build:renderer')
runNpm('run', 'build:cli')

// Refresh generated assets so an earlier build cannot retain local WDA signing
// products. WDA is prepared and installed separately, never shipped in desktop.
const workspaceRoot = await fs.realpath(process.cwd())
const distRoot = await fs.realpath('dist')
if (!distRoot.startsWith(workspaceRoot + path.sep)) throw new Error('Build output escaped workspace')
await fs.remove('dist/build')
await fs.copy('build', 'dist/build', { filter: file => !['native-airplay', 'android-server', 'ios-wda'].includes(path.relative('build', file).split(path.sep)[0]) })
await verifyIconSet(iconManifest, true)
await fs.copy('resources/android', 'dist/resources/android')
await fs.copy('resources/airplay', 'dist/resources/airplay')
await fs.copyFile('resources/platform-backends.json', 'dist/resources/platform-backends.json')
await fs.copy('resources/hdc', 'dist/resources/hdc')
await fs.copy('resources/uitestkit_sdk', 'dist/resources/uitestkit_sdk')
const nativeManifest = await fs.readJson('vendor/native-video/manifest.json')
await validateNativeResources('resources/native-video', nativeManifest, path.resolve('vendor/native-video'))
// Replace only this generated resource folder, and copy an exact allowlist.
// Refuse output redirected outside this workspace before recursive removal.
const outputRoot = await fs.realpath('dist/resources')
if (!outputRoot.startsWith(workspaceRoot + path.sep)) throw new Error('Native resource output escaped workspace')
const nativeOutput = path.join(outputRoot, 'native-video')
if (await fs.pathExists(nativeOutput) && (await fs.lstat(nativeOutput)).isSymbolicLink()) throw new Error('Native resource output must not be a symlink')
await fs.remove(nativeOutput)
await fs.ensureDir(nativeOutput)
for (const file of [...nativeManifest.libraries.map(entry => entry.file), 'LICENSE', 'README.md', 'manifest.json']) {
  await fs.copyFile(path.join('resources/native-video', file), path.join(nativeOutput, file))
}
await fs.copy('LICENSE', 'dist/LICENSE')
const nativeNotices = await fs.readFile('vendor/native-video/README.md', 'utf8') + '\n' + await fs.readFile('vendor/native-video/LICENSE', 'utf8')
await fs.writeFile('dist/THIRD_PARTY_NOTICES.txt', await vendorNotices(process.cwd()) + '\n' + nativeNotices)
process.chdir('dist')

await fs.writeJson('package.json', pkg, {
  spaces: 2,
})

runNpm('install', '--omit=dev', '--no-audit', '--no-fund')
