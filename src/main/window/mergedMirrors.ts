import { ipcMain } from 'electron'
import type { BrowserWindow, WebContents } from 'electron'
import type { MergedMirrorFrame, MirrorPlatform } from 'common/types'
import * as windows from 'share/main/lib/window'

export interface MirrorSource { window: BrowserWindow; platform: MirrorPlatform; deviceKey: string }
interface SourceState {
  source: MirrorSource
  throttled: boolean
  visible: boolean
  hide: () => void
  frame?: MergedMirrorFrame
  pending?: Promise<void>
}
let win: BrowserWindow | undefined
let sources: () => MirrorSource[] = () => []
let initialized = false
const states = new Map<WebContents, SourceState>()
const platforms: MirrorPlatform[] = ['android', 'harmony', 'ios']

function release(contents: WebContents, state: SourceState) {
  states.delete(contents)
  const window = state.source.window
  window.removeListener('show', state.hide)
  if (!contents.isDestroyed()) contents.setBackgroundThrottling(state.throttled)
  if (!window.isDestroyed() && state.visible) window.show()
}

function syncSources() {
  const active = sources().filter(source => !source.window.isDestroyed())
  const included = new Set(active.map(source => source.window.webContents))
  for (const [contents, state] of states) if (!included.has(contents)) release(contents, state)
  for (const source of active) {
    const window = source.window, contents = window.webContents
    if (states.has(contents)) continue
    const state: SourceState = { source, throttled: contents.getBackgroundThrottling(),
      // Newly created windows have not reached ready-to-show yet. Restore
      // them too when leaving merged mode, but respect a user's minimization.
      visible: !window.isMinimized(), hide: () => window.hide() }
    states.set(contents, state)
    contents.setBackgroundThrottling(false)
    window.on('show', state.hide)
    window.hide()
  }
  return active
}

function refresh(state: SourceState) {
  if (state.pending) return
  const contents = state.source.window.webContents
  // Encoding runs asynchronously in Chromium, rather than blocking the video
  // decoder with full-size synchronous PNG compression. Only one export per
  // source can be outstanding; a stalled renderer cannot build an IPC queue.
  state.pending = contents.executeJavaScript(`new Promise(resolve => {
    const canvas = document.querySelector('canvas');
    if (!canvas || !canvas.width || !canvas.height) return resolve(null);
    const width = canvas.width, height = canvas.height;
    canvas.toBlob(blob => {
      if (!blob) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ image: reader.result, width, height });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.95);
  })`).then(frame => {
    if (frame && states.get(contents) === state) state.frame = { sourceId: state.source.window.id, platform: state.source.platform, ...frame }
  }).catch(() => {}).finally(() => { state.pending = undefined })
}

function capture(): MergedMirrorFrame[] {
  const active = syncSources()
  return platforms.flatMap(platform => active.filter(source => source.platform === platform).map(source => {
    const state = states.get(source.window.webContents)!
    refresh(state)
    // Return each source separately, including multiple devices of one OS.
    // Every window hidden by syncSources must have a column in the merged view.
    return state.frame || { sourceId: source.window.id, platform, image: '', width: 0, height: 0 }
  }))
}

export function closeMergedMirrors() {
  const closing = win
  win = undefined
  for (const [contents, state] of states) release(contents, state)
  if (closing && !closing.isDestroyed()) closing.close()
}

export function showMergedMirrors(provider: () => MirrorSource[]) {
  sources = provider
  syncSources()
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return }
  if (!initialized) {
    initialized = true
    ipcMain.handle('getMergedMirrorFrames', event => {
      if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
        throw new Error('Invalid merged mirror document')
      return capture()
    })
  }
  win = windows.create({ name: 'merged-mirrors', width: 1200, height: 850, minWidth: 600, minHeight: 400, customTitlebar: false })
  const created = win
  win.on('closed', () => {
    if (win !== created) return
    win = undefined
    for (const [contents, state] of states) release(contents, state)
  })
  windows.loadPage(win, { page: 'merged-mirror' })
}
