// Real renderer/Luna/CSS in Electron; only device data and settings are simulated.
// Run after npm run build:renderer. No phone frames or user profile are accessed.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { _electron: electron } = require('playwright-core')
const root = path.resolve(__dirname, '..')

async function main() {
  const output = path.resolve(process.argv[2] || 'release/screenshot-navigation/report.json')
  await fs.mkdir(path.dirname(output), { recursive: true })
  const report = {
    boundary: 'Real Electron, production renderer, Panel and Luna ImageViewer/CSS. Simulated device image/settings in an isolated profile; no real device or installed-app acceptance.',
    cases: [],
  }
  const files = ['vendor/packages/luna-image-viewer/src/image-viewer/style.scss', 'src/renderer/main/components/workspace/Panel.tsx']
  report.sourceHashes = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex')])))
  try {
    for (const language of ['en-US', 'zh-CN']) {
      for (const theme of ['light', 'dark']) {
        const env = { ...process.env, UI_LANGUAGE: language, UI_THEME: theme, UI_PAGE: 'screenshot' }
        delete env.ELECTRON_RUN_AS_NODE
        const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'ui-preview/main.cjs')], env })
        let profile
        try {
          profile = await app.evaluate(({ app }) => app.getPath('userData'))
          const page = await app.firstWindow()
          const errors = []
          page.on('pageerror', error => errors.push(error.message))
          const selector = '#panel-screenshot .luna-image-viewer-image'
          await page.waitForFunction(selector => {
            const img = document.querySelector(selector)
            return img?.complete && img.naturalWidth && img.classList.contains('luna-image-viewer-image-transition')
          }, selector)
          for (const width of [1180, 960]) {
            await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 800), width)
            for (const destination of ['application', 'shell', 'settings']) {
              await page.locator('[data-navigation="screenshot"]').click()
              await page.waitForFunction(() => document.querySelector('#panel-screenshot').getAttribute('aria-hidden') === 'false')
              // Allow initial resize/reset to settle, then rotate and zoom the real viewer.
              await page.waitForTimeout(350)
              // Use the production icon-bearing controls, independent of translation wording.
              for (const icon of ['rotate-right', 'zoom-in'])
                await page.locator(`#panel-screenshot button:has(.icon-${icon})`).click()
              await page.waitForTimeout(350)
              const sample = await page.evaluate(async ({ selector, destination }) => {
                const img = document.querySelector(selector)
                const before = img.style.cssText
                const button = document.querySelector(destination === 'settings' ? '[data-action="settings"]' : `[data-navigation="${destination}"]`)
                button.click()
                const samples = []
                const started = performance.now()
                // Every animation frame spanning the original 300ms visibility transition.
                do {
                  await new Promise(requestAnimationFrame)
                  samples.push({ elapsed: performance.now() - started, active: document.querySelector(`#panel-${destination}`).getAttribute('aria-hidden') === 'false', visibility: getComputedStyle(img).visibility })
                } while (performance.now() - started < 400)
                document.querySelector('[data-navigation="screenshot"]').click()
                await new Promise(requestAnimationFrame)
                await new Promise(requestAnimationFrame)
                return { samples, sameImage: img === document.querySelector(selector), geometryPreserved: before === img.style.cssText, returnedVisibility: getComputedStyle(img).visibility }
              }, { selector, destination })
              const entry = { language, theme, width, destination, ...sample }
              report.cases.push(entry)
              assert.ok(sample.samples.length > 1, 'must sample multiple rendering frames')
              assert.ok(sample.samples.every(frame => frame.active && frame.visibility === 'hidden'), `Screenshot remained visible after switching to ${destination}: ${JSON.stringify(sample.samples)}`)
              assert.equal(sample.sameImage, true, 'navigation must preserve the loaded image')
              assert.equal(sample.geometryPreserved, true, 'navigation must preserve zoom and rotation')
              assert.equal(sample.returnedVisibility, 'visible')
            }
          }
          assert.deepEqual(errors, [], 'renderer errors')
        } finally {
          await app.close()
          if (profile) await fs.rm(profile, { recursive: true, force: true })
        }
      }
    }
    report.passed = true
  } catch (error) {
    report.passed = false
    report.error = error.message
    process.exitCode = 1
  } finally {
    await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, output, error: report.error }))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
