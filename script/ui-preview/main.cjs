const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'scrcpy-ui-completion-')))
app.whenReady().then(() => {
  nativeTheme.themeSource = process.env.UI_THEME || 'light'
  ipcMain.handle('fixture-theme', (_, value) => {
    if (value && ['system','light','dark'].includes(value)) nativeTheme.themeSource=value
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })
  const win = new BrowserWindow({ width: Number(process.env.UI_WIDTH || 1180), height: Number(process.env.UI_HEIGHT || 800), title: 'UI verification — simulated data', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false } })
  nativeTheme.on('updated', () => { if (!win.isDestroyed()) win.webContents.send('fixture-theme-updated') })
  win.webContents.on('console-message', (event) => { if (event.level === 'error') console.error('renderer:', event.message) })
  win.webContents.on('render-process-gone', (_, details) => console.error('renderer-gone', details.reason))
  win.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'), {query: process.env.UI_WINDOW ? {page:process.env.UI_WINDOW} : {}})
})
app.on('window-all-closed', () => app.quit())
