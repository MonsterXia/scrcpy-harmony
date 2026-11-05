import { BrowserWindow, ipcMain, screen } from 'electron'
import * as window from 'share/main/lib/window'
import { getScreencastStore } from '../lib/store'
import once from 'licia/once'
import { handleEvent } from 'share/main/lib/util'
import { IpcGetStore, IpcSetStore } from 'share/common/types'
import type { ITarget, MirrorSession } from 'common/types'
import { registerCaptureWindow } from '../lib/hdc/captureSessions'

const store = getScreencastStore()

const windows = new Map<string, { win: BrowserWindow; target: ITarget }>()
export function isCaptureWindow(win: unknown) { return [...windows.values()].some(entry => entry.win === win) }
export function hasWindows() { return windows.size > 0 }
export function getWindows() { return [...windows.values()].map(entry => entry.win).filter(win => !win.isDestroyed()) }
export function getSources() { return [...windows.values()].filter(entry => !entry.win.isDestroyed())
  .map(entry => ({ window: entry.win, platform: 'harmony' as const, deviceKey: entry.target.key })) }
export function listSessions(): MirrorSession[] {
  return [...windows.values()].map(({ win, target }) => ({ id: `harmony:${win.id}`,
    deviceKey: target.key, name: target.name, platform: 'harmony', state: 'running' }))
}
export function closeSession(id: string) {
  for (const { win } of windows.values()) {
    if (id === `harmony:${win.id}`) { win.close(); return true }
  }
  return false
}
function senderWindow(event: Electron.IpcMainInvokeEvent) {
  const entry = [...windows.values()].find(({ win }) => win.webContents === event.sender)
  if (!entry || event.senderFrame !== entry.win.webContents.mainFrame) throw new Error('Invalid capture document')
  return entry
}

export function showWin(target: ITarget) {
  const existing = windows.get(target.key)
  if (existing) {
    existing.win.focus()
    return
  }

  initIpc()

  const win = window.create({
    name: `screencast-${encodeURIComponent(target.key)}`,
    minWidth: 320,
    minHeight: 320,
    width: 500,
    height: 640,
  })
  windows.set(target.key, { win, target: { ...target } })
  const releaseCapture = registerCaptureWindow(win.webContents)
  // BrowserWindow closed may precede webContents destroyed. Detach locally
  // before destroy on close, with closed as the direct-destroy fallback.
  win.on('close', releaseCapture)
  win.on('closed', releaseCapture)

  // The shared factory may restore bounds from a larger display. Constrain
  // the result in DIP, after restoration and before the window is shown.
  const bounds = win.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  win.setMinimumSize(Math.min(320, area.width), Math.min(320, area.height))
  win.setBounds({
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  })

  win.on('close', () => {
    win?.destroy()
  })

  // destroy() can bypass close; release the singleton on actual destruction.
  win.on('closed', () => {
    windows.delete(target.key)
    const mainWin = window.getWin('main')
    if (mainWin) {
      mainWin.show()
    }
  })

  window.loadPage(win, { page: 'screencast' })
}

export function closeWin() {
  for (const { win } of windows.values()) win.close()
}

const initIpc = once(() => {
  ipcMain.handle('getScreencastTarget', event => senderWindow(event).target)
  ipcMain.handle('closeScreencast', event => senderWindow(event).win.close())
  ipcMain.handle('fitScreencast', (event, frameWidth: number, frameHeight: number, verticalInset: number) => {
    const { win } = senderWindow(event)
    if (![frameWidth, frameHeight].every(value => Number.isInteger(value) && value > 0 && value <= 16384) ||
      !Number.isFinite(verticalInset) || verticalInset < 0 || verticalInset > 512) {
      throw new Error('Invalid screencast dimensions')
    }
    if (win.isMaximized() || win.isFullScreen()) return
    const bounds = win.getBounds()
    const content = win.getContentBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    const borderWidth = Math.max(0, bounds.width - content.width)
    const chromeHeight = Math.max(0, bounds.height - content.height) + verticalInset
    const ratio = frameWidth / frameHeight
    // Preserve the user's approximate window area, then fit within this display.
    // Frame pixels define only the ratio; window bounds and chrome are in DIP.
    const videoArea = content.width * Math.max(1, content.height - verticalInset)
    const videoWidth = Math.min(
      Math.sqrt(videoArea * ratio),
      Math.max(1, area.width - borderWidth),
      Math.max(1, area.height - chromeHeight) * ratio,
    )
    const width = Math.min(area.width, Math.round(videoWidth + borderWidth))
    const height = Math.min(area.height, Math.round(videoWidth / ratio + chromeHeight))
    win.setMinimumSize(Math.min(320, width), Math.min(320, height))
    win.setBounds({
      x: Math.round(Math.max(area.x, Math.min(bounds.x + (bounds.width - width) / 2, area.x + area.width - width))),
      y: Math.round(Math.max(area.y, Math.min(bounds.y + (bounds.height - height) / 2, area.y + area.height - height))),
      width,
      height,
    })
  })
  handleEvent('setScreencastStore', <IpcSetStore>(
    ((name, val) => store.set(name, val))
  ))
  handleEvent('getScreencastStore', <IpcGetStore>((name) => store.get(name)))
  ipcMain.handle('setScreencastAlwaysOnTop', (event, alwaysOnTop: boolean) => {
    if (typeof alwaysOnTop !== 'boolean') throw new Error('Invalid always-on-top value')
    senderWindow(event).win.setAlwaysOnTop(alwaysOnTop)
  })
})
