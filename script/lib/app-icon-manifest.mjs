import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const variants = ['light', 'dark', 'mono']
const files = [
  'build/icon.png', 'build/icon.ico', 'build/mac-icon/Assets.car', 'build/mac-icon/icon.icns',
  'build/ScrcpyPlus.icon/icon.json',
  ...['front', 'rear', 'plus'].map(name => `build/ScrcpyPlus.icon/Assets/${name}.svg`),
  ...variants.flatMap(name => ['svg', 'png'].map(ext => `build/app-icons/${name}.${ext}`)),
  ...['icon', 'icon-dark', 'icon-mono'].map(name => `src/renderer/assets/${name}.png`),
]

export async function iconHashes() {
  return Object.fromEntries(await Promise.all(files.map(async file => [file, await digest(file)])))
}

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

// Renderer icons are consumed by Vite. Check the inputs before and after it
// runs, and check the copied packaging resources in dist against the same set.
export async function verifyIconSet(expected, copied = false) {
  for (const file of files) {
    const actual = copied && file.startsWith('build/') ? path.join('dist', file) : file
    if (await digest(actual) !== expected[file]) {
      throw new Error(`Icon set mismatch: ${actual}. Finish regenerating the icons and rebuild.`)
    }
  }
}
