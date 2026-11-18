import builder from 'electron-builder'
import isMac from 'licia/isMac.js'
import path from 'node:path'
import { prepareMacIconToolchain } from './lib/mac-icon-toolchain.mjs'

prepareMacIconToolchain()
const outputOverride = process.env.SCRCPY_PLUS_PACK_OUTPUT
  ? path.resolve(process.env.SCRCPY_PLUS_PACK_OUTPUT) : undefined

cd('dist')

const pkg = await fs.readJson('package.json')

let publishChannel = 'latest'
if (isMac && process.arch !== 'arm64') {
  publishChannel = 'latest-${arch}'
}

const config = {
  appId: pkg.appId,
  directories: {
    output: outputOverride || `../release/${pkg.version}`,
  },
  asarUnpack: ['node_modules/**/*.node'],
  files: ['main', 'preload', 'renderer', 'LICENSE', 'THIRD_PARTY_NOTICES.txt'],
  extraResources: {
    from: 'resources',
    to: './',
    filter: ['**/*'],
  },
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  nsis: {
    allowToChangeInstallationDirectory: true,
    oneClick: false,
  },
  win: {
    target: [
      {
        target: 'nsis',
      },
    ],
  },
  mac: {
    icon: 'ScrcpyPlus.icon',
    // Explicit development signing rebuilds the bundle seal after packaging.
    // Omit the flag when using a configured Developer ID identity.
    ...(process.argv.includes('--adhoc-sign') ? { identity: '-', notarize: false } : {}),
    electronLanguages: ['zh_CN', 'en'],
    target: [
      {
        target: 'dmg',
      },
    ],
  },
  publish: {
    ...pkg.publish,
    channel: publishChannel,
  },
}

await builder.build({
  config,
  // Publishing is explicit; local and CI builds never upload by default.
  publish: process.argv.includes('--publish') && !process.argv.includes('--no-publish') ? 'always' : 'never',
})
