import { BrowserWindow, ipcMain, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ITarget, MirrorSession, NativeMirrorInput } from 'common/types'
import * as windows from 'share/main/lib/window'
import { AndroidMirror } from '../lib/devices/android'
import { AirplayMirror } from '../lib/devices/airplay'
import { FrameGate } from '../lib/devices/media'

interface Session {
  info: MirrorSession
  target: ITarget
  window: BrowserWindow
  backend?: AndroidMirror | AirplayMirror
  ready: boolean
  gate: FrameGate
  starting?: Promise<void>
  stopping?: Promise<void>
}
export function validateNativeInput(input: NativeMirrorInput) {
  if (!input || typeof input !== 'object') throw new Error('Invalid input')
  if (input.type === 'text') {
    if (typeof input.text !== 'string' || input.text.length > 16384) throw new Error('Invalid text')
  } else if (input.type === 'key') {
    if (!Number.isInteger(input.keyCode) || input.keyCode < 0 || input.keyCode > 300) throw new Error('Invalid key')
  } else if (input.type === 'touch' || input.type === 'scroll') {
    if (![input.x, input.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Invalid position')
    if (input.type === 'touch' && !['down', 'move', 'up'].includes(input.action)) throw new Error('Invalid touch')
    if (input.type === 'scroll' && ![input.dx, input.dy].every(value => Number.isFinite(value) && Math.abs(value) <= 1)) throw new Error('Invalid scroll')
  } else throw new Error('Invalid input type')
}
class NativeMirrors {
  private sessions = new Map<string, Session>()
  private initialized = false
  private disposed = false
  list() { return [...this.sessions.values()].map(session => ({ ...session.info })) }
  getWindows() { return [...this.sessions.values()].filter(session => !session.stopping && !session.window.isDestroyed()).map(session => session.window) }
  getSources() { return [...this.sessions.values()].filter(session => !session.stopping && !session.window.isDestroyed())
    .map(session => ({ window: session.window, platform: session.target.platform!, deviceKey: session.info.deviceKey })) }
  async start(target: ITarget) {
    if (this.disposed) throw new Error('Mirrors closed')
    const key = target.platform === 'ios' ? 'ios:airplay-receiver' : target.key
    const existing = [...this.sessions.values()].find(session => session.info.deviceKey === key)
    if (existing) {
      if (existing.stopping || existing.window.isDestroyed()) { await this.stop(existing.info.id); return this.start(target) }
      else {
        existing.window.focus()
        if (existing.ready && ['error', 'disconnected'].includes(existing.info.state)) await this.open(existing)
        return
      }
    }
    this.init()
    const id = randomUUID()
    const win = windows.create({ name: `native-mirror-${encodeURIComponent(key)}`, width: 480, height: 800, minWidth: 320, minHeight: 400 })
    const session: Session = { info: { id, deviceKey: key, name: target.platform === 'ios' ? 'Scrcpy Plus' : target.name,
      platform: target.platform!, state: 'starting' }, target: target.platform === 'ios'
      ? { ...target, key, name: 'AirPlay', connectionId: undefined, transport: 'receiver' } : { ...target },
      window: win, ready: false, gate: new FrameGate() }
    this.sessions.set(id, session)
    win.webContents.on('did-start-navigation', details => {
      if (details.isMainFrame && !details.isSameDocument) {
        session.ready = false; session.gate.reset()
        if (session.backend) void this.stop(id).catch(() => {})
      }
    })
    win.webContents.on('did-navigate', () => { session.ready = true })
    win.webContents.on('render-process-gone', () => { session.ready = false; void this.stop(id).catch(() => {}) })
    win.on('closed', () => { session.ready = false; void this.stop(id).catch(() => {}); windows.getWin('main')?.show() })
    windows.loadPage(win, { page: 'native-mirror' })
  }
  private state(session: Session, value: string) {
    if (session.stopping || this.sessions.get(session.info.id) !== session) return
    session.info.state = value === 'connected' ? 'running' : value as MirrorSession['state']
    if (session.ready && !session.window.isDestroyed()) session.window.webContents.send('nativeMirrorState', { ...session.info })
  }
  private open(session: Session): Promise<void> {
    if (session.starting) return session.starting
    if (session.backend && !['error', 'disconnected'].includes(session.info.state)) return Promise.resolve()
    let backend: AndroidMirror | AirplayMirror | undefined = session.backend
    session.starting = (async () => {
      await session.backend?.close()
      if (session.stopping) throw new Error('Mirror is stopping')
      session.gate.reset()
      backend = session.target.platform === 'android' ? new AndroidMirror(session.target) : new AirplayMirror()
      session.backend = backend
      this.state(session, 'starting')
      await backend.start(frame => {
        if (!session.ready || session.stopping || session.window.isDestroyed()) return
        const packet = session.gate.push(frame)
        if (packet) session.window.webContents.send('nativeMirrorFrame', { ...packet, sessionId: session.info.id })
      }, value => this.state(session, value))
    })().catch(async error => {
      let cleaned = false
      try { await backend?.close(); cleaned = true } catch { /* Keep ownership so cleanup can be retried. */ }
      if (!session.stopping) {
        if (cleaned) session.backend = undefined
        this.state(session, 'error')
      }
      console.error('Native mirror startup failed:', error instanceof Error ? error.message : 'unknown')
      throw new Error('Native mirror connection failed')
    }).finally(() => { session.starting = undefined })
    return session.starting
  }

  stop(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) return Promise.resolve()
    if (session.stopping) return session.stopping
    const wasReady = session.ready
    session.info.state = 'stopping'; session.ready = false; session.gate.reset()
    session.stopping = (async () => {
      await session.backend?.close()
      await session.starting?.catch(() => {})
      // A start that completed after cancellation is closed once more.
      await session.backend?.close()
      if (!session.window.isDestroyed()) session.window.destroy()
      this.sessions.delete(id)
    })().catch(error => {
      session.stopping = undefined
      session.ready = wasReady && !session.window.isDestroyed()
      this.state(session, 'error')
      console.error('Native mirror cleanup failed')
      throw error
    })
    return session.stopping
  }
  async dispose() { this.disposed = true; await Promise.all([...this.sessions.keys()].map(id => this.stop(id))) }
  private owner(event: Electron.IpcMainInvokeEvent) {
    const session = [...this.sessions.values()].find(session => session.window.webContents === event.sender)
    if (!session || !session.ready || session.stopping || event.senderFrame !== event.sender.mainFrame) throw new Error('Mirror document unavailable')
    return session
  }
  private init() {
    if (this.initialized) return
    this.initialized = true
    ipcMain.handle('nativeMirrorInfo', event => { const s = this.owner(event); return { id: s.info.id, target: s.target, state: s.info.state } })
    ipcMain.handle('nativeMirrorOpen', event => this.open(this.owner(event)))
    ipcMain.handle('nativeMirrorFit', (event, width: number, height: number, verticalInset: number, horizontalInset: number) => {
      const win = this.owner(event).window
      if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 16384) ||
        ![verticalInset, horizontalInset].every(value => Number.isFinite(value) && value >= 0 && value <= 512)) throw new Error('Invalid mirror dimensions')
      if (win.isMaximized() || win.isFullScreen()) return
      const bounds = win.getBounds(), content = win.getContentBounds()
      const area = screen.getDisplayMatching(bounds).workArea
      const insetX = bounds.width - content.width + horizontalInset
      const insetY = bounds.height - content.height + verticalInset
      const ratio = width / height
      const videoArea = Math.max(1, content.width - horizontalInset) * Math.max(1, content.height - verticalInset)
      const videoWidth = Math.min(Math.sqrt(videoArea * ratio), Math.max(1, area.width - insetX), Math.max(1, area.height - insetY) * ratio)
      const fittedWidth = Math.round(videoWidth + insetX), fittedHeight = Math.round(videoWidth / ratio + insetY)
      win.setMinimumSize(Math.min(280, fittedWidth), Math.min(320, fittedHeight))
      win.setAspectRatio(ratio, { width: insetX, height: insetY })
      win.setBounds({ x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - fittedWidth))),
        y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - fittedHeight))), width: fittedWidth, height: fittedHeight })
    })
    ipcMain.handle('nativeMirrorAck', (event, sequence: number) => {
      const session = this.owner(event)
      if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid frame acknowledgement')
      session.gate.ack(sequence)
    })
    ipcMain.handle('nativeMirrorInput', (event, input: NativeMirrorInput) => {
      const session = this.owner(event); validateNativeInput(input)
      if (!(session.backend instanceof AndroidMirror)) throw new Error('Control unsupported')
      return session.backend.input(input)
    })
  }
}
export const nativeMirrors = new NativeMirrors()
