// Production renderer in isolated Electron; fixture IPC, no device access.
import { _electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Script } from 'node:vm'

const root = process.cwd()
const output = path.resolve(process.argv[2] || 'docs/design/scrcpy-plus-icon/verification')
const renderer = path.resolve(process.argv[3] || 'dist/renderer/index.html')
const temporary = await mkdtemp(path.join(tmpdir(), 'plus-icon-ui-'))
await mkdir(output, { recursive: true })
const report = { scope: 'Production renderer, real Electron nativeTheme, fixture IPC; no phone I/O', cases: [], resources: [] }
let application
try {
  await writeFile(path.join(temporary, 'preload.cjs'), `
    const {contextBridge,ipcRenderer}=require('electron');
    contextBridge.exposeInMainWorld('main',{
      on:(name,fn)=>{const handler=(_,data)=>fn(data);ipcRenderer.on(name,handler);return()=>ipcRenderer.removeListener(name,handler)},
      getLanguage:()=>ipcRenderer.invoke('language'),getTheme:()=>ipcRenderer.invoke('theme'),
      getUpdateState:async()=>({status:'checking',productName:'Scrcpy Plus',currentVersion:'1.0.5-dev.2'}),updateAction:async()=>{}
    });
    contextBridge.exposeInMainWorld('preload',{setTitle:()=>{}});
  `)
  await writeFile(path.join(temporary, 'main.cjs'), `
    const {app,BrowserWindow,ipcMain,nativeTheme}=require('electron');
    app.setPath('userData',${JSON.stringify(path.join(temporary, 'profile'))});
    global.language='en-US';
    ipcMain.handle('language',()=>global.language);
    ipcMain.handle('theme',()=>nativeTheme.shouldUseDarkColors?'dark':'light');
    nativeTheme.on('updated',()=>BrowserWindow.getAllWindows().forEach(w=>w.webContents.send('updateTheme')));
    app.whenReady().then(()=>{
      const window = new BrowserWindow({
        width:400,height:280,useContentSize:true,
        webPreferences:{preload:${JSON.stringify(path.join(temporary, 'preload.cjs'))}}
      });
      return window.loadFile(${JSON.stringify(renderer)},{query:{page:'about'}});
    });
    app.on('window-all-closed',()=>app.quit());
  `)
  // Catch generated-code errors before Electron can show a main-process dialog.
  for (const filename of ['main.cjs', 'preload.cjs']) {
    new Script(await readFile(path.join(temporary, filename), 'utf8'), { filename })
  }
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  // Playwright defaults to emulating light mode; disable that so this check
  // observes Electron's real nativeTheme -> CSS media query propagation.
  application = await _electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.join(temporary, 'main.cjs')], env, timeout: 30000, colorScheme: null })
  console.log('Icon UI: Electron launched')
  const page = await application.firstWindow()
  console.log('Icon UI: window ready')
  page.setDefaultTimeout(15000)
  const lightData = 'data:image/png;base64,' + (await readFile('src/renderer/assets/icon.png')).toString('base64')
  const darkData = 'data:image/png;base64,' + (await readFile('src/renderer/assets/icon-dark.png')).toString('base64')
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  for (const language of ['en-US', 'zh-CN']) for (const view of ['about', 'update']) {
    console.log(`Icon UI: ${language} ${view}`)
    await application.evaluate(({ BrowserWindow }, { renderer, language, view }) => {
      global.language = language
      return BrowserWindow.getAllWindows()[0].loadFile(renderer, { query: { page: view } })
    }, { renderer, language, view })
    const sources = []
    for (const theme of ['light', 'dark', 'light']) {
      await application.evaluate(({ nativeTheme }, theme) => { nativeTheme.themeSource = theme }, theme)
      await page.waitForFunction(({ theme, view, lightData, darkData }) => {
        const img = document.querySelector('img')
        const expected = theme === 'dark' ? darkData : lightData
        return img?.complete && img.naturalWidth === 128 &&
          (view !== 'about' || document.querySelector('[data-theme]')?.dataset.theme === theme) &&
          (img.currentSrc === expected || (!img.currentSrc.startsWith('data:') && /icon-dark/.test(img.currentSrc) === (theme === 'dark')))
      }, { theme, view, lightData, darkData }).catch(async error => {
        console.error('Icon UI failure', { theme, view, errors }, await page.evaluate(({ lightData, darkData }) => {
          const img = document.querySelector('img')
          return { darkMedia: matchMedia('(prefers-color-scheme: dark)').matches, complete: img?.complete,
            width: img?.naturalWidth, lightSelected: img?.currentSrc === lightData, darkSelected: img?.currentSrc === darkData,
            hasDarkSource: document.querySelector('source')?.srcset === darkData }
        }, { lightData, darkData }))
        throw error
      })
      const image = page.locator('img').first()
      const box = await image.boundingBox()
      assert.equal(box.width, view === 'about' ? 62 : 64)
      sources.push(await image.evaluate(img => img.currentSrc))
      await page.screenshot({ path: path.join(output, `${view}-${language}-${theme}.png`) })
      report.cases.push({ language, view, theme, imageWidth: box.width, switched: true })
    }
    assert.equal(sources[0], sources[2], 'Switching back restores the light resource')
    assert.notEqual(sources[0], sources[1])
  }
  assert.deepEqual(errors, [])

  // Read the actual generated files: alpha must be clean and identical across
  // appearances, including the antialiasing at the rounded tile boundary.
  const paths = ['light', 'dark', 'mono'].map(name => pathToFileURL(path.join(root, 'build/app-icons', `${name}.png`)).href)
  const pixels = await page.evaluate(async paths => {
    const result = []
    for (const src of paths) {
      const image = new Image(); image.src = src; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
      const data = ctx.getImageData(0, 0, 1024, 1024).data
      let exteriorPixels = 0
      const alpha = new Uint8Array(1024 * 1024)
      for (let i = 0; i < alpha.length; i++) {
        alpha[i] = data[i * 4 + 3]
        const x = i % 1024, y = Math.floor(i / 1024)
        if ((x < 64 || y < 64 || x >= 960 || y >= 960) && alpha[i]) exteriorPixels++
      }
      const digest = await crypto.subtle.digest('SHA-256', alpha)
      result.push({ width: image.width, height: image.height, exteriorPixels, alphaHash: Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('') })
    }
    return result
  }, paths)
  for (const [index, result] of pixels.entries()) {
    assert.equal(result.width, 1024); assert.equal(result.height, 1024)
    assert.equal(result.exteriorPixels, 0); assert.equal(result.alphaHash, pixels[0].alphaHash)
    report.resources.push({ appearance: ['light', 'dark', 'mono'][index], ...result })
  }
  const ico = await readFile('build/icon.ico')
  assert.equal(ico.readUInt16LE(2), 1)
  const icoSizes = []
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const p = 6 + 16 * i, size = ico[p] || 256
    const length = ico.readUInt32LE(p + 8), offset = ico.readUInt32LE(p + 12)
    assert.ok(offset + length <= ico.length)
    assert.equal(ico.subarray(offset, offset + 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(ico.readUInt32BE(offset + 16), size)
    assert.equal(ico.readUInt32BE(offset + 20), size)
    icoSizes.push(size)
  }
  assert.deepEqual(icoSizes, [16, 24, 32, 48, 64, 128, 256])
  report.icoSizes = icoSizes

  await page.setViewportSize({ width: 1100, height: 550 })
  await page.setContent(`<style>body{margin:0;background:#e9ebee;color:#17263c;font:16px system-ui}h1{text-align:center;margin:28px 0 20px;font-size:24px}.row{display:flex;justify-content:center;gap:44px}.item{text-align:center}.hero{width:280px;height:280px}.sizes{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:18px;height:64px}p{margin:4px 0}</style><h1>Scrcpy Plus · 正式图标</h1><div class="row">${paths.map((src, index) => `<div class="item"><img class="hero" src="${src}"><p>${['浅色', '深色', '单色'][index]}</p><div class="sizes">${[16,32,64].map(size => `<img width="${size}" height="${size}" src="${src}">`).join('')}</div></div>`).join('')}</div>`)
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0))
  await page.screenshot({ path: path.join(output, 'formal-icons.png') })
  report.passed = true
  await writeFile(path.join(output, 'ui-and-assets.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
