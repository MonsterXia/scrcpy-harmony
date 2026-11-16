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
    application.process().stderr?.on('data', chunk => { void writeFile(path.join(directory, `${language}-runtime.log`), chunk, { flag: 'a' }) })
    application.process().once('exit', (code, signal) => { console.log(`${language}: Electron exit code=${code} signal=${signal}`) })
    await application.evaluate(({ ipcMain, BrowserWindow }) => {
      const targets = [
        { key: 'harmony:a', name: 'HUAWEI Mate 80', platform: 'harmony', state: 'ready' },
        { key: 'android:a', name: 'Pixel 9', platform: 'android', state: 'ready' },
        { key: 'android:b', name: 'Pixel 9', platform: 'android', state: 'unauthorized' },
        { key: 'android:c', name: 'Offline', platform: 'android', state: 'offline' },
        { key: 'ios:01234567-1234567890abcdef', name: 'iPhone Fixture', platform: 'ios', state: 'ready', transport: 'usb' },
        { key: 'ios:airplay-receiver', name: 'AirPlay', platform: 'ios', transport: 'receiver', state: 'waiting' },
      ]
      targets.push(
        { key: 'android:running', name: 'Mi 10 Ultra', platform: 'android', state: 'ready', transport: 'usb' },
        { key: 'harmony:running', name: 'nova 15', platform: 'harmony', state: 'ready', transport: 'usb' },
      )
      const sessions = targets.filter(t => t.key.endsWith(':running')).map(t => ({ id: t.key, deviceKey: t.key, name: t.name, platform: t.platform, state: 'running' }))
      let layout = 'independent'
      globalThis.__plusLayouts = []; globalThis.__plusFocused = []; globalThis.__plusOverviewReads = []
      globalThis.__plusDiscoveryReads = 0; globalThis.__plusTargets = targets; globalThis.__plusSessions = sessions
      for (const channel of ['getDevices', 'showScreencast', 'getMirrorSessions', 'stopMirrorSession', 'applyMirrorLayout', 'getMirrorLayout', 'focusMirror', 'getDeviceOverview']) ipcMain.removeHandler(channel)
      ipcMain.handle('getDevices', () => { globalThis.__plusDiscoveryReads++; return { targets, errors: [] } })
      ipcMain.handle('showScreencast', (_, key) => {
        const target = targets.find(target => target.key === key)
        if (!sessions.some(item => item.deviceKey === key)) sessions.push({ id: key, deviceKey: key, name: target.name, platform: target.platform, state: target.transport === 'receiver' ? 'waiting' : 'running' })
      })
      ipcMain.handle('getMirrorSessions', () => sessions)
      ipcMain.handle('getMirrorLayout', () => layout)
      ipcMain.handle('focusMirror', (_, key) => { globalThis.__plusFocused.push(key) })
      ipcMain.handle('applyMirrorLayout', (_, request) => { globalThis.__plusLayouts.push(request); layout = request.layout })
      ipcMain.handle('stopMirrorSession', (_, id) => { const index = sessions.findIndex(item => item.id === id); if (index >= 0) sessions.splice(index, 1) })
      ipcMain.handle('getDeviceOverview', (_, key) => {
        globalThis.__plusOverviewReads.push(key)
        const target = targets.find(target => target.key === key)
        if (target.platform === 'ios') return {name:target.name,brand:'Apple',model:'iPhone18,1',osVersion:'iOS 27.2.1',buildVersion:'24B156',hardwareModel:'V53AP',abi:'arm64e',udid:'01234567-1234567890abcdef',serialNum:'',modelNumber:''}
        return { name: target.name, brand: target.platform === 'android' ? 'Google' : 'HUAWEI', model: target.name,
          osVersion: target.platform === 'android' ? 'Android 16 (API 36)' : '', processor: 'ARM', abi: 'arm64-v8a', memTotal: 8589934592, physicalResolution: '1080x2400', serialNum: 'fixture', kernelVersion: '6.1' }
      })
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('changeTarget')
    })
    const page = await application.firstWindow(); page.setDefaultTimeout(15000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.locator('[data-workspace]').waitFor()
    await page.waitForFunction(() => document.querySelectorAll('[data-device-row]').length === 5 && document.querySelectorAll('[data-session-row]').length === 2)
    const feature = page.locator('[data-navigation="devices"]')
    assert.equal(await feature.locator('svg').count(), 1)
    assert.equal(await page.locator('nav [data-navigation]').count(), 8)
    const sidebarCases = []
    for (const width of [960, 1280]) {
      await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 850), width)
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => main.setSettingsStore('theme', theme), theme)
        await page.waitForFunction(theme => document.querySelector('[data-workspace]').dataset.theme === theme, theme)
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
    assert.equal(await page.locator('aside #workspace-device').count(), 0)
    assert.equal(await page.locator('[data-device-row="android:b"] input').isDisabled(), true)
    assert.equal(await page.locator('[data-device-row="android:c"] input').isDisabled(), true)
    assert.equal(await page.locator('[data-action="start-selected"]').isDisabled(), true)
    await page.locator('[data-device-row="android:a"] input').check()
    await page.locator('[data-device-row="harmony:a"] input').check()
    await page.screenshot({ path: path.join(directory, `${language}-unavailable-devices.png`) })
    // Match the three-available/two-running layout including USB iOS for visual comparison.
    await application.evaluate(({ BrowserWindow }) => {
      const targets = globalThis.__plusTargets
      globalThis.__plusUnavailable = targets.filter(t => t.state === 'unauthorized' || t.state === 'offline')
      for (let i = targets.length - 1; i >= 0; i--) if (globalThis.__plusUnavailable.includes(targets[i])) targets.splice(i, 1)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('changeTarget')
    })
    await page.waitForFunction(() => document.querySelectorAll('[data-device-row]').length === 3)
    // Themes must use identical geometry, including after responsive reflow.
    for (const width of [960, 1280]) {
      await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 850), width)
      let previous
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => main.setSettingsStore('theme', theme), theme)
        await page.waitForFunction(theme => document.querySelector('[data-workspace]').dataset.theme === theme, theme)
        const geometry = await page.locator('[data-mirror-workspace]').evaluate(node => ({
          fits: node.scrollWidth <= node.clientWidth,
          rows: [...node.querySelectorAll('[data-device-row], [data-session-row], [data-layout], [data-action="start-selected"]')].map(item => {
            const { x, y, width, height } = item.getBoundingClientRect(); return { x, y, width, height }
          }),
        }))
        assert.equal(geometry.fits, true)
        if (previous) assert.deepEqual(geometry.rows, previous.rows)
        previous = geometry
        await page.screenshot({ path: path.join(directory, `${language}-mirrors-${width}-${theme}.png`) })
      }
    }
    await application.evaluate(({ BrowserWindow }) => {
      globalThis.__plusTargets.push(...globalThis.__plusUnavailable)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('changeTarget')
    })
    await page.waitForFunction(() => document.querySelectorAll('[data-device-row]').length === 5)
    await page.locator('[data-action="start-selected"]').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-session-row]').length === 4)
    await page.locator('[data-session-row="android:a"] [data-action="focus"]').click()
    assert.equal(await application.evaluate(() => globalThis.__plusFocused.at(-1)), 'android:a')
    for (const layout of ['side-by-side', 'merged', 'independent']) {
      await page.locator(`[data-layout="${layout}"]`).click()
      await page.waitForFunction(value => document.querySelector(`[data-layout="${value}"]`)?.getAttribute('aria-pressed') === 'true', layout)
      const request = await application.evaluate(() => globalThis.__plusLayouts.at(-1))
      assert.equal(request.layout, layout); assert.equal(request.deviceKeys, undefined)
    }
    await page.locator('[data-session-row="android:a"] [data-action="stop"]').click()
    await page.locator('[data-device-row="android:a"]').waitFor()
    assert.equal((await page.evaluate(() => main.getMirrorSessions())).length, 3)
    await page.locator('[data-action="start-receiver"]').click()
    await page.locator('[data-action="focus-receiver"]').waitFor()
    assert.equal((await page.evaluate(() => main.getMirrorSessions())).at(-1).state, 'waiting')
    // One selector now lives inside Overview, including both supported platforms.
    await page.locator('[data-navigation="overview"]').click()
    await page.locator('#workspace-device').selectOption('android:a')
    await page.waitForFunction(() => document.querySelector('[data-overview-field="ohosVersion"]')?.textContent === 'Android 16 (API 36)')
    assert.equal(await page.locator('[data-navigation="shell"]').isDisabled(), true)
    assert.equal(await page.locator('#workspace-device option').count(), 7)
    const readCount = await application.evaluate(() => globalThis.__plusOverviewReads.length)
    await page.evaluate(() => { window.__overviewField = document.querySelector('[data-overview-field="name"]') })
    for (let index = 0; index < 3; index++) {
      await page.locator('#panel-overview [data-action="refresh-devices"]').click()
      await page.waitForFunction(() => !document.querySelector('#panel-overview [data-action="refresh-devices"]').disabled)
    }
    // Let two real five-second Store polling cycles run; no overview reload.
    const pollingObserved = await application.evaluate(() => new Promise(resolve => {
      const initial = globalThis.__plusDiscoveryReads
      const timer = setInterval(() => {
        if (globalThis.__plusDiscoveryReads >= initial + 2) { clearInterval(timer); clearTimeout(deadline); resolve(true) }
      }, 100)
      const deadline = setTimeout(() => { clearInterval(timer); resolve(false) }, 12000)
    }))
    assert.equal(pollingObserved, true)
    assert.equal(await application.evaluate(() => globalThis.__plusOverviewReads.length), readCount)
    assert.equal(await page.evaluate(() => window.__overviewField === document.querySelector('[data-overview-field="name"]')), true)
    await page.waitForFunction(() => !document.querySelector('.luna-notification-item'))
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => main.setSettingsStore('theme', theme), theme)
        await page.waitForFunction(theme => document.querySelector('[data-workspace]').dataset.theme === theme, theme)
      await page.screenshot({ path: path.join(directory, `${language}-overview-android-${theme}.png`) })
    }
    await page.locator('#workspace-device').selectOption('ios:01234567-1234567890abcdef')
    await page.waitForFunction(() => document.querySelector('[data-overview-field="ohosVersion"]')?.textContent === 'iOS 27.2.1')
    assert.equal(await page.locator('[data-navigation="shell"]').isDisabled(),true)
    assert.equal(await page.locator('[data-overview-field="hardwareModel"]').innerText(),'V53AP')
    for (const theme of ['light','dark']) {
      await page.evaluate(theme=>main.setSettingsStore('theme',theme),theme)
      await page.waitForFunction(theme=>document.querySelector('[data-workspace]').dataset.theme===theme,theme)
      await page.screenshot({path:path.join(directory,`${language}-overview-ios-${theme}.png`)})
    }
    await page.locator('#workspace-device').selectOption('harmony:a')
    await page.waitForFunction(() => document.querySelector('[data-overview-field="name"]')?.textContent === 'HUAWEI Mate 80')
    assert.equal(await page.locator('[data-navigation="shell"]').isDisabled(), false)
    await page.screenshot({ path: path.join(directory, `${language}-overview-harmony.png`) })
    assert.equal((await page.evaluate(() => main.getMirrorSessions())).length, 4)
    await page.locator('[data-action="settings"]').click()
    await page.screenshot({ path: path.join(directory, `${language}-settings.png`) })
    // Change the real persisted preference while both renderer pages stay mounted.
    const sessionSnapshot = await page.evaluate(() => main.getMirrorSessions())
    const processId = await application.evaluate(() => process.pid)
    const auxiliaryPromise = application.waitForEvent('window')
    await page.evaluate(() => main.showProcess())
    const auxiliary = await auxiliaryPromise
    await auxiliary.locator('.luna-data-grid-header').waitFor()
    await auxiliary.evaluate(() => { window.__languageGrid = document.querySelector('.luna-data-grid') })
    await page.locator('#settings-hdc-path').fill('/unsaved/language-test')
    await page.evaluate(() => { window.__languageInput = document.querySelector('#settings-hdc-path') })
    const liveLanguageCases = []
    for (const choice of [language === 'en-US' ? 'zh-CN' : 'en-US', language, 'system']) {
      await page.locator('[data-settings] select').first().selectOption(choice)
      await page.waitForFunction(() => !document.querySelector('[data-settings] select').disabled)
      const resolved = await page.evaluate(() => main.getLanguage())
      await page.waitForFunction(locale => document.documentElement.lang === locale, resolved)
      await auxiliary.waitForFunction(locale => document.documentElement.lang === locale, resolved)
      const chinese = resolved === 'zh-CN'
      assert.equal(await page.locator('[data-settings] h1').innerText(), chinese ? '设置' : 'Settings')
      assert.match(await auxiliary.locator('.luna-data-grid-header').innerText(), chinese ? /进程名称/ : /Process Name/)
      assert.equal(await auxiliary.title(), chinese ? '进程管理器' : 'Process Manager')
      const menus = await application.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(item => item.label))
      assert.ok(menus.includes(chinese ? '工具' : 'Tools'))
      assert.equal(await page.locator('#settings-hdc-path').inputValue(), '/unsaved/language-test')
      assert.equal(await page.evaluate(() => window.__languageInput === document.querySelector('#settings-hdc-path')), true)
      assert.equal(await auxiliary.evaluate(() => window.__languageGrid === document.querySelector('.luna-data-grid')), true)
      assert.deepEqual(await page.evaluate(() => main.getMirrorSessions()), sessionSnapshot)
      assert.equal(await application.evaluate(() => process.pid), processId)
      assert.equal(await page.evaluate(() => main.getSettingsStore('language')), choice)
      await page.screenshot({ path: path.join(directory, `${language}-live-${choice}.png`) })
      liveLanguageCases.push({ choice, resolved, statePreserved: true, menuAndAuxiliaryTranslated: true })
    }
    await auxiliary.close()
    assert.deepEqual(errors, [])
    report.cases.push({ language, liveLanguageCases, sidebarCases,
      batchSelection: true, focusWithoutRestart: true, layoutScopeAllSessions: true, stopIsolation: true,
      iosReceiverSeparated: true, overviewPlatforms: ['android', 'harmony', 'ios'], repeatedDiscoveryPreservesOverview: true,
      sameGeometryInBothThemes: true, runtime: await application.evaluate(() => process.versions.electron), passed: true })
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
