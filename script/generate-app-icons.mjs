// Authoring only: generated resources are checked in, so builds do not need Chrome.
import { mkdir, writeFile, mkdtemp, rename, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { iconSvg, layerSvg, palettes, shapes, composerDocument } from './lib/app-icon-design.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(root, 'build/app-icons')
const composer = path.join(root, 'build/ScrcpyPlus.icon')
const assets = new Map()
for (const name of Object.keys(shapes)) assets.set(path.join(composer, 'Assets', `${name}.svg`), layerSvg(name))
assets.set(path.join(composer, 'icon.json'), JSON.stringify(composerDocument, null, 2) + '\n')

const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
  ? { executablePath: process.env.BROWSER_EXECUTABLE, headless: true }
  : { channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  async function rasterize(source, size) {
    return Buffer.from(await page.evaluate(async ({ source, size }) => {
      const image = new Image()
      image.src = 'data:image/svg+xml;base64,' + btoa(source)
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0, size, size)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { source, size }), 'base64')
  }
  for (const name of Object.keys(palettes)) {
    const source = iconSvg(name)
    assets.set(path.join(output, `${name}.svg`), source)
    assets.set(path.join(output, `${name}.png`), await rasterize(source, 1024))
    assets.set(path.join(root, 'src/renderer/assets', name === 'light' ? 'icon.png' : `icon-${name}.png`), await rasterize(source, 128))
  }
  assets.set(path.join(root, 'build/icon.png'), assets.get(path.join(output, 'light.png')))
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const entries = await Promise.all(sizes.map(size => rasterize(iconSvg('light'), size)))
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  entries.forEach((png, index) => {
    const pos = 6 + index * 16
    header[pos] = header[pos + 1] = sizes[index] % 256
    header.writeUInt16LE(1, pos + 4)
    header.writeUInt16LE(32, pos + 6)
    header.writeUInt32LE(png.length, pos + 8)
    header.writeUInt32LE(offset, pos + 12)
    offset += png.length
  })
  assets.set(path.join(root, 'build/icon.ico'), Buffer.concat([header, ...entries]))

} finally {
  await browser.close()
}

// Stage every output before replacing any checked-in file. Renaming on the same
// volume also prevents readers from observing partially written PNG/ICO files.
const staging = await mkdtemp(path.join(root, '.app-icons-'))
try {
  for (const [destination, data] of assets) {
    const staged = path.join(staging, path.relative(root, destination))
    await mkdir(path.dirname(staged), { recursive: true })
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(staged, data)
  }
  for (const destination of assets.keys()) {
    await rename(path.join(staging, path.relative(root, destination)), destination)
  }
  console.log('Generated three SVG/PNG appearances, renderer PNGs, Windows ICO and Icon Composer layers.')
} finally {
  await rm(staging, { recursive: true, force: true })
}
