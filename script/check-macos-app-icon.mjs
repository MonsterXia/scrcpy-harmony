import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
import { parse } from 'plist'
import { prepareMacIconToolchain } from './lib/mac-icon-toolchain.mjs'

assert.equal(process.platform, 'darwin')
assert.ok(process.argv[2], 'Pass the packaged .app path')
const app = path.resolve(process.argv[2])
const output = path.resolve(process.argv[3] || 'docs/design/scrcpy-plus-icon/verification')
await mkdir(output, { recursive: true })
prepareMacIconToolchain()
const contents = path.join(app, 'Contents')
const info = parse(await readFile(path.join(contents, 'Info.plist'), 'utf8'))
assert.equal(info.CFBundleIconName, 'Icon')
assert.equal(info.CFBundleIconFile, 'icon.icns')
const car = path.join(contents, 'Resources/Assets.car')
const catalog = JSON.parse(execFileSync('/usr/bin/assetutil', ['-I', car], { encoding: 'utf8' }))
const appearances = Object.keys(catalog[0].Appearances)
for (const appearance of ['NSAppearanceNameAqua', 'NSAppearanceNameDarkAqua', 'ISAppearanceTintable']) assert.ok(appearances.includes(appearance))
assert.ok(catalog.some(asset => asset.AssetType === 'IconImageStack'))
const icns = await readFile(path.join(contents, 'Resources/icon.icns'))
assert.equal(icns.subarray(0, 4).toString(), 'icns')
assert.equal(icns.readUInt32BE(4), icns.length)
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' })

const developerDir = process.env.DEVELOPER_DIR || execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim()
const ictool = path.resolve(developerDir, '../Applications/Icon Composer.app/Contents/Executables/ictool')
const renditions = ['Default', 'Dark', 'TintedLight', 'TintedDark', 'ClearLight', 'ClearDark']
const rendered = []
const help = execFileSync(ictool, ['--help'], { encoding: 'utf8' })
assert.ok(help.includes('--export-image') && help.includes('--design-generation'),
  'The two-generation preview check requires Icon Composer from Xcode 27. Packaging only requires Xcode 26.')
const toolVersion = JSON.parse(execFileSync(ictool, ['--version'], { encoding: 'utf8' }))['short-bundle-version']
const generations = [26, 27]
for (const generation of generations) for (const rendition of renditions) {
  const filename = `macos-${generation}-${rendition}.png`
  execFileSync(ictool, ['build/ScrcpyPlus.icon', '--export-image', '--output-file', path.join(output, filename),
    '--platform', 'macOS', '--rendition', rendition, '--width', '256', '--height', '256', '--scale', '1', '--design-generation', String(generation)], { stdio: 'pipe' })
  const png = await readFile(path.join(output, filename))
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  rendered.push({ generation, rendition, file: filename, sha256: createHash('sha256').update(png).digest('hex') })
}
assert.equal(new Set(rendered.map(item => item.sha256)).size, rendered.length, 'Native appearances must render distinctly')
const report = {
  scope: 'Packaged asset catalog and signature; Icon Composer native rendering. Global appearance preferences were not changed.',
  toolVersion, generations,
  bundleIconName: info.CFBundleIconName, legacyIcon: info.CFBundleIconFile,
  appearances, catalogEntries: catalog.length, icnsBytes: icns.length,
  assetCatalogSha256: createHash('sha256').update(await readFile(car)).digest('hex'),
  signatureIntegrity: 'passed (codesign --verify --deep --strict)', rendered, passed: true,
}
await writeFile(path.join(output, 'macos.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
