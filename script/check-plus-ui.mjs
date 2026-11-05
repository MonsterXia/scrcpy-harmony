// Real Electron/preload/React shell with simulated device/session IPC; no phone I/O.
// Usage: node script/check-plus-ui.mjs [evidence-directory] [electron-executable]
import { _electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const directory = path.resolve(process.argv[2] || 'docs/scrcpy-plus/evidence')
await mkdir(directory, { recursive: true })
const temporary = await mkdtemp(path.join(tmpdir(), 'plus-ui-'))
const sockets = new Set()
const server = createServer(socket => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {})
  const send = value => { const body = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(body.length); socket.write(Buffer.concat([size, body])) }
  const hello = Buffer.alloc(16); hello.write('OHOS HDC'); send(hello)
  let data = Buffer.alloc(0), first = true
  socket.on('data', chunk => {
    data = Buffer.concat([data, chunk])
    while (data.length >= 4 && data.length >= data.readUInt32BE(0) + 4) {
      const size = data.readUInt32BE(0), body = data.subarray(4, size + 4); data = data.subarray(size + 4)
      if (first) { first = false; continue }
      if (body.toString() === 'list targets') send('[Empty]')
    }
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const report = { scope: 'Real Electron UI shell with simulated device/session IPC; no physical phone or backend acceptance', cases: [] }
let application
try {
  for (const language of ['en-US', 'zh-CN']) {
    const profile = path.join(temporary, language)
    await mkdir(path.join(profile, 'data'), { recursive: true })
    await writeFile(path.join(profile, 'data/settings.json'), JSON.stringify({ language, theme: 'dark' }))
    // A wrapper sets the profile before share/main derives its config path.
    const entry = path.join(temporary, `entry-${language}.cjs`)
    await writeFile(entry, `require('electron').app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.resolve('dist/main/index.js'))});`)
    application = await _electron.launch({
      executablePath: process.argv[3] || createRequire(import.meta.url)('electron'),
      args: [entry], env: { ...process.env, OHOS_HDC_SERVER_PORT: String(server.address().port) }, timeout: 30000,
    })
    await application.evaluate(({ ipcMain, BrowserWindow }) => {
      const targets = [
        { key: 'harmony:a', name: 'HUAWEI Mate 80', platform: 'harmony', state: 'ready' },
        { key: 'android:a', name: 'Pixel 9', platform: 'android', state: 'ready' },
        { key: 'android:b', name: 'Pixel 9', platform: 'android', state: 'unauthorized' },
        { key: 'android:c', name: 'Offline', platform: 'android', state: 'offline' },
        { key: 'ios:01234567-1234567890abcdef', name: 'iPhone Fixture', platform: 'ios', state: 'ready' },
        { key: 'ios:airplay-receiver', name: 'AirPlay', platform: 'ios', transport: 'receiver', state: 'waiting' },
      ]
      const sessions = []; globalThis.__plusArrangeCount = 0; globalThis.__plusMergeCount = 0; globalThis.__plusLayouts = []
      for (const channel of ['getDevices', 'showScreencast', 'getMirrorSessions', 'stopMirrorSession', 'arrangeMirrors', 'showMergedMirrors', 'applyMirrorLayout']) ipcMain.removeHandler(channel)
      ipcMain.handle('getDevices', () => ({ targets, errors: [] }))
      ipcMain.handle('showScreencast', (_, key) => {
        const target = targets.find(target => target.key === key)
        const deviceKey = target.platform === 'ios' ? 'ios:airplay-receiver' : key
        if (!sessions.some(item => item.deviceKey === deviceKey)) sessions.push({ id: deviceKey, deviceKey, name: target.name, platform: target.platform, state: target.platform === 'ios' ? 'waiting' : 'running' })
      })
      ipcMain.handle('getMirrorSessions', () => sessions)
      ipcMain.handle('arrangeMirrors', () => { globalThis.__plusArrangeCount++ })
      ipcMain.handle('showMergedMirrors', () => { globalThis.__plusMergeCount++ })
      ipcMain.handle('applyMirrorLayout', (_, request) => { globalThis.__plusLayouts.push(request) })
      ipcMain.handle('stopMirrorSession', (_, id) => { const index = sessions.findIndex(item => item.id === id); if (index >= 0) sessions.splice(index, 1) })
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('changeTarget')
    })
    const page = await application.firstWindow(); page.setDefaultTimeout(15000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.locator('[data-workspace]').waitFor()
    await page.waitForFunction(() => document.querySelector('[data-device-picker]')?.options.length === 6 && document.querySelector('#workspace-device')?.options.length === 1)
    const feature = page.locator('[data-navigation="devices"]')
    assert.equal(await feature.locator('svg').count(), 1)
    assert.equal(await page.locator('nav [data-navigation]').count(), 8)
    const sidebarCases = []
    for (const width of [960, 1280]) {
      await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 850), width)
      for (const theme of ['light', 'dark']) {
        await page.locator('[data-workspace]').evaluate((node, theme) => { node.dataset.theme = theme }, theme)
        const geometry = await feature.evaluate(node => {
          const rect = node.getBoundingClientRect(), sidebar = node.closest('aside').getBoundingClientRect()
          const svg = node.querySelector('svg').getBoundingClientRect()
          return { inside: rect.left >= sidebar.left && rect.right <= sidebar.right, iconVisible: svg.width >= 30 && svg.height >= 30, scrollFits: node.scrollWidth <= node.clientWidth }
        })
        assert.equal(geometry.inside, true); assert.equal(geometry.iconVisible, true); assert.equal(geometry.scrollFits, true)
        await page.screenshot({ path: path.join(directory, `${language}-sidebar-${width}-${theme}.png`) })
        sidebarCases.push({ width, theme, ...geometry })
      }
    }
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 850))
    await page.locator('[data-device-picker]').selectOption('harmony:a')
    assert.match(await page.locator('#panel-devices h2').first().innerText(), /HUAWEI Mate 80/)
    assert.equal(await page.locator('[data-navigation="shell"]').isDisabled(), false)
    await page.locator('[data-device-picker]').selectOption('android:a')
    assert.equal(await page.locator('#workspace-device').inputValue(), 'harmony:a')
    assert.equal(await page.locator('[data-navigation="shell"]').isDisabled(), false)
    await page.locator('[data-action="start-selected"]').click()
    await page.waitForFunction(async () => (await main.getMirrorSessions()).length === 1)
    assert.equal((await page.evaluate(() => main.getMirrorSessions()))[0].platform, 'android')
    for (const width of [960, 1280]) {
      await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 850), width)
      await page.screenshot({ path: path.join(directory, `${language}-independent-devices-${width}.png`) })
    }
    // Choosing another tools device leaves the mirroring picker untouched.
    await page.locator('details summary').click()
    await page.locator('#workspace-device').selectOption('harmony:a')
    assert.equal(await page.locator('[data-device-picker]').inputValue(), 'android:a')
    await page.locator('[data-device-picker]').selectOption('ios:01234567-1234567890abcdef')
    await page.locator('[data-action="start-selected"]').click()
    await page.waitForFunction(async () => (await main.getMirrorSessions()).length === 2)
    assert.equal(await page.locator('[data-navigation="shell"]').isDisabled(), false)
    assert.equal(await page.locator('#workspace-device').inputValue(), 'harmony:a')
    await page.reload()
    await page.waitForFunction(() => document.querySelector('[data-device-picker]')?.value === 'ios:01234567-1234567890abcdef')
    assert.equal(await page.locator('#workspace-device').inputValue(), 'harmony:a')
    assert.equal(await page.locator('[data-navigation="shell"]').isDisabled(), false)
    await page.screenshot({ path: path.join(directory, `${language}-devices.png`) })
    const sessions = await page.evaluate(() => main.getMirrorSessions())
    assert.equal(sessions.length, 2)
    await page.evaluate(async () => { const sessions = await main.getMirrorSessions(); await main.stopMirrorSession(sessions.find(item => item.platform === 'android').id) })
    assert.equal((await page.evaluate(() => main.getMirrorSessions())).length, 1)
    await page.locator('[data-start-mode]').selectOption('all')
    await page.locator('[data-action="start-mode"]').click()
    await page.waitForFunction(async () => (await main.getMirrorSessions()).length === 3)
    assert.deepEqual((await page.evaluate(() => main.getMirrorSessions())).map(s => s.platform).sort(), ['android', 'harmony', 'ios'])
    await page.locator('#panel-devices button').filter({ hasText: language === 'zh-CN' ? '并排排列' : 'Arrange side by side' }).click()
    await page.waitForFunction(() => !document.querySelector('[data-action="apply-layout"]').disabled)
    assert.equal(await application.evaluate(() => globalThis.__plusLayouts.at(-1).layout), 'side-by-side')
    await page.locator('#panel-devices button').filter({ hasText: language === 'zh-CN' ? '合并排列' : 'Merge views' }).click()
    await page.waitForFunction(() => !document.querySelector('[data-action="apply-layout"]').disabled)
    assert.equal(await application.evaluate(() => globalThis.__plusLayouts.at(-1).layout), 'merged')
    for (const mode of ['single', 'android-harmony', 'all']) {
      await page.locator('[data-start-mode]').selectOption(mode)
      for (const layout of ['independent', 'side-by-side', 'merged']) {
        await page.locator('[data-layout-mode]').selectOption(layout)
        await page.locator('[data-action="start-mode"]').click()
        await page.waitForFunction(() => !document.querySelector('[data-action="start-mode"]').disabled)
        const applied = await application.evaluate(() => globalThis.__plusLayouts.at(-1))
        assert.equal(applied.layout, layout)
        const expected = mode === 'single' ? ['ios:airplay-receiver'] : mode === 'android-harmony' ? ['android:a', 'harmony:a'] : ['android:a', 'harmony:a', 'ios:airplay-receiver']
        assert.deepEqual(applied.deviceKeys.sort(), expected)
        assert.equal((await page.evaluate(() => main.getMirrorSessions())).length, 3)
      }
    }
    await page.screenshot({ path: path.join(directory, `${language}-modes.png`) })
    await page.locator('[data-action="settings"]').click()
    await page.screenshot({ path: path.join(directory, `${language}-settings.png`) })
    assert.deepEqual(errors, [])
    report.cases.push({ language, sidebarCases, dedicatedMultiMirrorEntry: true, independentDeviceSelection: true, independentChoicesRestoredAfterReload: true, harmonyToolsEnabledDuringAndroidAndIosMirroring: true, harmonyDestinations: 8, devices: 6, harmonySelectableOnDevicePage: true, concurrentSessions: 3, platforms: ['android', 'harmony', 'ios'], stopIsolation: true, startupLayoutPairs: 9, otherSessionsPreserved: true,
      runtime: await application.evaluate(() => process.versions.electron), passed: true })
    await application.close(); application = undefined
  }
  report.passed = true
} catch (error) {
  report.passed = false
  report.error = error.message
  throw error
} finally {
  if (application) await application.close()
  for (const socket of sockets) socket.destroy()
  await new Promise(resolve => server.close(resolve))
  await rm(temporary, { recursive: true, force: true })
  await writeFile(path.join(directory, 'ui.json'), JSON.stringify(report, null, 2) + '\n')
}
