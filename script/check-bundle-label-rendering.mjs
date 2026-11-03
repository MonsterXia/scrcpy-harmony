// Controlled renderer regression; synthetic IPC data, no device mutations.
// Build first: node script/check-bundle-label-rendering.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { _electron } from 'playwright-core'
import probeContract from './lib/application-probe-contract.cjs'
const { confirmationActions, findConfirmationAction } = probeContract

const profile = await mkdtemp(path.join(os.tmpdir(), 'scrcpy-label-rendering-'))
await mkdir(path.join(profile, 'data'))
await writeFile(path.join(profile, 'data/main.json'), JSON.stringify({ panel: 'application' }))
const label = '<img data-label-injection src=x onerror="window.__labelInjected=true"> A&B'
let app
try {
  app = await _electron.launch({ executablePath: createRequire(import.meta.url)('electron'),
    args: [path.resolve('dist'), `--user-data-dir=${profile}`], chromiumSandbox: true })
  const page = await app.firstWindow()
  await page.locator('[data-workspace]').waitFor()
  await app.evaluate(({ ipcMain }, label) => {
    const responses = {
      getTargets: [{ key: 'LABEL_FIXTURE', name: 'Label fixture', ohosVersion: '', sdkVersion: '' }],
      getBundles: ['test.label', 'test.other'],
      getBundleInfos: [{ bundleName: 'test.label', label, icon: '', system: false,
        versionName: '1', apiTargetVersion: 26, vendor: '', installTime: 0, releaseType: '', mainAbility: 'EntryAbility' },
      { bundleName: 'test.other', label: 'Other fixture', icon: '', system: false,
        versionName: '1', apiTargetVersion: 26, vendor: '', installTime: 0, releaseType: '' }],
    }
    for (const [channel, value] of Object.entries(responses)) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => value)
    }
    for (const channel of ['stopBundle', 'cleanBundleCache', 'cleanBundleData', 'uninstallBundle']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => { throw new Error('Device mutations are forbidden in this test') })
    }
    ipcMain.removeHandler('showContextMenu')
    ipcMain.handle('showContextMenu', (_event, _x, _y, template) => {
      globalThis.labelTestMenu = template
    })
  }, label)
  await page.reload()
  const panel = page.locator('[data-application]')
  await panel.waitFor()
  const icons = panel.locator('.luna-icon-list-name-wrapper')
  const icon = icons.filter({ hasText: label })
  await icon.waitFor()
  assert.equal(await icon.textContent(), label, 'Icon view must display literal label text')
  assert.equal(await page.locator('[data-label-injection]').count(), 0)
  await icon.hover()
  assert.equal(await icon.locator('..').getAttribute('title'), label)
  await panel.locator('input[type="search"]').fill('A&B')
  await page.waitForFunction(() => document.querySelectorAll('.luna-icon-list-name-wrapper').length === 1)
  assert.equal(await icons.count(), 1, 'Nonmatching labels must be excluded')
  assert.equal(await icon.count(), 1, 'Search must use raw label text')
  await panel.locator('input[type="search"]').fill('')
  await page.waitForFunction(() => document.querySelectorAll('.luna-icon-list-name-wrapper').length === 2)
  await panel.locator('[data-action="list-view"]').click()
  const row = panel.locator('.luna-data-grid-data-container tr').filter({ hasText: 'test.label' })
  await row.waitFor()
  assert.ok((await row.textContent()).includes(label))
  for (const action of confirmationActions) {
    await app.evaluate(() => { globalThis.labelTestMenu = null })
    await row.locator('td').first().dispatchEvent('contextmenu', { clientX: 20, clientY: 80 })
    await page.waitForTimeout(200)
    const item = findConfirmationAction(await app.evaluate(() => globalThis.labelTestMenu), action)
    await app.evaluate(({ BrowserWindow }, click) => {
      BrowserWindow.getAllWindows()[0].webContents.send('clickContextMenu', click)
    }, item.click)
    const modal = page.locator('.luna-modal:not(.luna-modal-hidden), [role="alertdialog"]')
    await modal.waitFor()
    assert.ok((await modal.textContent()).includes(label), `${action} must display literal label text`)
    assert.equal(await modal.locator('[data-label-injection]').count(), 0)
    await modal.locator('.luna-modal-button, button').filter({ hasText: /^(取消|Cancel)$/ }).click()
  }
  assert.equal(await page.evaluate(() => !!window.__labelInjected), false)
  console.log('Literal labels passed icon view, list view and four cancelled confirmation dialogs')
} finally {
  if (app) await app.close().catch(() => {})
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
