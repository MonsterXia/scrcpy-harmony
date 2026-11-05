import fs from 'node:fs/promises'
import path from 'node:path'

export async function vendorNotices(root) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'vendor/manifest.json'), 'utf8'))
  const sections = ['Scrcpy Harmony — third-party source notices\n\nLocal modifications do not replace upstream authorship or licenses.']
  for (const pkg of manifest.packages) {
    const license = await fs.readFile(path.join(root, 'vendor/packages', pkg.name, 'LICENSE'), 'utf8')
    sections.push(`${pkg.name} ${pkg.version}\n${pkg.repository}\nSource commit: ${pkg.gitHead}\n\n${license}`)
  }
  for (const source of manifest.sharedSources) {
    sections.push(`${source.path}\n${source.repository}\nSource commit: ${source.commit}\n${source.license}`)
  }
  const sourceNotices = [
    'vendor/scrcpy-server/LICENSE', 'vendor/airplay/uxplay/LICENSE',
    'vendor/airplay/uxplay/lib/playfair/LICENSE.md', 'vendor/airplay/uxplay/lib/llhttp/LICENSE-MIT',
    'vendor/airplay/libplist/COPYING', 'vendor/airplay/libplist/COPYING.LESSER',
    'native/airplay/OPENSSL-LICENSE.txt', 'node_modules/node-addon-api/LICENSE.md',
    'node_modules/usb/LICENSE', 'node_modules/usb/libusb/COPYING',
  ]
  const tango = path.join(root, 'vendor/tango/SOURCE.json')
  try {
    const source = JSON.parse(await fs.readFile(tango, 'utf8'))
    for (const pkg of source.packages) {
      const name = pkg.name.split('/').at(-1)
      sections.push(`${pkg.name} ${pkg.version}\nVendored original TypeScript source from npm\n` + await fs.readFile(path.join(root, 'vendor/tango', name, 'LICENSE'), 'utf8'))
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const file of sourceNotices) {
    try { sections.push(`${file}\n\n` + await fs.readFile(path.join(root, file), 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n'
}
