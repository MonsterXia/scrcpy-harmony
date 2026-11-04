// Validate the shipped renderer CSS through real refresh notifications in Electron.
// Run after npm run build:renderer. UI preview uses simulated devices only.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { _electron: electron } = require('playwright-core')
const root = path.resolve(__dirname, '..')
async function main() {
  const output = path.resolve(process.argv[2] || 'release/main-feedback')
  await fs.mkdir(output, { recursive: true })
  const report = { boundary: 'Built production renderer/CSS and actual refresh UI; simulated devices and isolated settings. Additional long/error/warning/info cards clone the real notification DOM to check styles only.', cases: [] }
  try {
    for (const language of ['en-US', 'zh-CN']) {
      for (const theme of ['light', 'dark']) {
        const env = { ...process.env, UI_LANGUAGE: language, UI_THEME: theme, UI_PAGE: 'application', UI_WIDTH: '960' }
        delete env.ELECTRON_RUN_AS_NODE
        const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'ui-preview/main.cjs')], env })
        let profile
        try {
          profile = await app.evaluate(({ app }) => app.getPath('userData'))
          const page = await app.firstWindow()
          await page.locator('summary').click()
          const refresh = page.locator('[data-action="refresh-devices"]')
          await refresh.click()
          await page.locator('.luna-notification-item').waitFor()
          await refresh.click()
          await page.waitForFunction(() => document.querySelectorAll('.luna-notification-item').length === 2)
          const evidence = await page.evaluate(() => {
            const cards = [...document.querySelectorAll('.luna-notification-item')]
            const style = getComputedStyle(cards[0])
            const icon = getComputedStyle(cards[0].querySelector('.luna-notification-icon-container'))
            const bounds = cards.map(card => { const r = card.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } })
            return { radius: style.borderRadius, background: style.backgroundColor, fontSize: style.fontSize, shadow: style.boxShadow, iconBackground: icon.backgroundColor, gap: bounds[1].y - bounds[0].bottom, bounds }
          })
          report.cases.push({ language, theme, notification: evidence })
          await page.screenshot({ path: path.join(output, `${language}-${theme}-refresh.png`) })
          const left = Math.min(...evidence.bounds.map(r => r.x)) - 16
          const right = Math.max(...evidence.bounds.map(r => r.x + r.width)) + 16
          await page.screenshot({
            path: path.join(output, `${language}-${theme}-cards.png`),
            clip: { x: left, y: evidence.bounds[0].y - 16, width: right - left, height: evidence.bounds[1].bottom - evidence.bounds[0].y + 32 },
          })
          assert.ok(parseFloat(evidence.radius) >= 10, 'Built main-window toast must use workspace rounded corners, not the legacy 4px style')
          assert.equal(evidence.background, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(32, 35, 41)', 'toast must follow workspace theme')
          assert.ok(evidence.gap >= 6 && evidence.gap <= 10, 'repeated feedback must form a compact non-overlapping stack')
          assert.ok(evidence.bounds.every(r => r.height >= 40 && r.x >= 16 && r.x + r.width <= 944))
          // Preserve the real card for style-only variants while actual timers expire.
          await page.evaluate(() => {
            const template = document.querySelector('.luna-notification-item').cloneNode(true)
            const host = template.ownerDocument.querySelector('.luna-notification')
            for (const kind of ['success', 'error', 'warning', 'info']) {
              const card = template.cloneNode(true)
              card.removeAttribute('id')
              card.dataset.feedbackFixture = kind
              const icon = card.querySelector('.luna-notification-icon-container')
              icon.className = `luna-notification-icon-container luna-notification-${kind}`
              icon.firstElementChild.className = `luna-notification-icon luna-notification-icon-${kind === 'success' ? 'check' : kind === 'warning' ? 'warn' : kind}`
              card.querySelector('.luna-notification-content').textContent = ({ success: 'Saved successfully · 已保存', error: 'Unable to refresh devices · 无法刷新设备', warning: 'Check the device connection · 请检查设备连接', info: 'Application-package-with-a-long-name-'.repeat(8) })[kind]
              host.append(card)
            }
          })
          await page.waitForFunction(() => [...document.querySelectorAll('.luna-notification-item')].every(card => card.dataset.feedbackFixture))
          await page.locator('summary').click()
          await page.screenshot({ path: path.join(output, `${language}-${theme}-variants.png`) })
          const variants = await page.evaluate(() => [...document.querySelectorAll('[data-feedback-fixture]')].map(card => {
            const r = card.getBoundingClientRect()
            return { kind: card.dataset.feedbackFixture, x: r.x, right: r.right, fits: card.scrollWidth <= card.clientWidth, height: r.height }
          }))
          assert.ok(variants.every(v => v.fits && v.x >= 16 && v.right <= 944), 'long messages must wrap inside the window')
          report.cases.at(-1).variants = variants
          // Removing the opt-in emulates a different window: old styles must remain.
          const unscopedRadius = await page.evaluate(() => {
            delete document.documentElement.dataset.workspaceWindow
            const radius = getComputedStyle(document.querySelector('.luna-notification-item')).borderRadius
            document.documentElement.dataset.workspaceWindow = 'true'
            return radius
          })
          assert.equal(unscopedRadius, '4px', 'main-window styles must not leak to mirroring/update windows')
          await page.evaluate(() => document.querySelectorAll('[data-feedback-fixture]').forEach(card => card.remove()))
          // Existing application confirmations keep their workspace style and cancel behavior.
          await page.locator('[data-application-item]').first().locator('td').first().click()
          const dialog = page.locator('[role="dialog"]')
          await dialog.getByRole('button', { name: language === 'en-US' ? 'Uninstall' : '卸载', exact: true }).click()
          const confirm = page.getByRole('alertdialog')
          await confirm.waitFor()
          assert.ok(await confirm.evaluate(node => parseFloat(getComputedStyle(node).borderRadius) >= 10))
          await page.screenshot({ path: path.join(output, `${language}-${theme}-confirm.png`) })
          await page.locator('[data-confirm-cancel]').click()
          await confirm.waitFor({ state: 'hidden' })
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
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, error: report.error, output }))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
