// Regenerate the two native resources on a Mac with Icon Composer support.
import { execFileSync } from 'node:child_process'
import { cp, copyFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { prepareMacIconToolchain } from './lib/mac-icon-toolchain.mjs'

prepareMacIconToolchain()
const temporary = await mkdtemp(path.join(tmpdir(), 'scrcpy-plus-icon-'))
try {
  const source = path.join(temporary, 'Icon.icon')
  const output = path.join(temporary, 'out')
  await cp('build/ScrcpyPlus.icon', source, { recursive: true })
  await mkdir(output)
  execFileSync('actool', [source, '--compile', output, '--app-icon', 'Icon',
    '--include-all-app-icons', '--output-partial-info-plist', path.join(temporary, 'Info.plist'),
    '--development-region', 'en', '--target-device', 'mac', '--minimum-deployment-target', '26.0',
    '--platform', 'macosx'], { stdio: 'inherit' })
  await mkdir('build/mac-icon', { recursive: true })
  await copyFile(path.join(output, 'Assets.car'), 'build/mac-icon/Assets.car')
  await copyFile(path.join(output, 'Icon.icns'), 'build/mac-icon/icon.icns')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
