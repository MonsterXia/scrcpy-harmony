import { iosSetup, prepareManagedIos, recoverManagedIos, setIosProvisioningBusy } from '../lib/ios-provisioning'
import type { IosSetupAction } from 'common/iosProvisioning'
import type { AutomationWindowHooks, AutomationWindowObserver } from '../automation/windowHooks'
import { ipcMain, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ITarget, MirrorSession, NativeMirrorInput } from 'common/types'
import * as windows from 'share/main/lib/window'
import { AndroidMirror } from '../lib/devices/android'
import { IosMirror } from '../lib/devices/ios'
import type { InputAction } from '../automation/input'
import { AirplayMirror } from '../lib/devices/airplay'
import { FrameGate } from '../lib/devices/media'

interface Session {
  info: MirrorSession
  target: ITarget
  window: windows.MirrorWindow
  contents: Electron.WebContents
  backend?: AndroidMirror | AirplayMirror | IosMirror
  ready: boolean
  automation?: AutomationWindowObserver
  gate: FrameGate
  starting?: Promise<void>
  stopping?: Promise<void>
  usbMissing?: boolean
  reconnectPending?: boolean
  videoRequested?: boolean
  hasConnected?: boolean
  recovery?: Promise<void>
  lastRunnerRecovery?: number
  videoRetriesLeft?: number
  nextVideoRetry?: number
  setupCalls: Set<AbortController>
  manualSetup?: AbortController
}
export function validateNativeInput(input: NativeMirrorInput) {
  if (!input || typeof input !== 'object') throw new Error('Invalid input')
  if (input.display && (![input.display.width, input.display.height].every(n => Number.isInteger(n) && n > 0 && n <= 16384) || ![0,90,180,270].includes(input.display.rotation))) throw new Error('Invalid input display')
  if (input.type === 'text') {
    if (typeof input.text !== 'string' || input.text.length > 16384) throw new Error('Invalid text')
  } else if (input.type === 'key') {
    if (!Number.isInteger(input.keyCode) || input.keyCode < 0 || input.keyCode > 300) throw new Error('Invalid key')
  } else if (input.type === 'touch' || input.type === 'scroll') {
    if (![input.x, input.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Invalid position')
    if (input.type === 'touch' && !['down', 'move', 'up', 'cancel'].includes(input.action)) throw new Error('Invalid touch')
    if (input.type === 'scroll' && ![input.dx, input.dy].every(value => Number.isFinite(value) && Math.abs(value) <= 1)) throw new Error('Invalid scroll')
  } else throw new Error('Invalid input type')
}
class NativeMirrors {
  private sessions = new Map<string, Session>()
  private initialized = false
  private disposed = false
  private automationHooks?: AutomationWindowHooks
  constructor() { setIosProvisioningBusy(udid => [...this.sessions.values()].some(s => s.target.connectionId === udid && !!s.backend && !['error','disconnected','stopping'].includes(s.info.state))) }
  setAutomationHooks(hooks: AutomationWindowHooks) { this.automationHooks = hooks }
  list() { return [...this.sessions.values()].map(session => ({ ...session.info })) }
  getWindows() { return [...this.sessions.values()].filter(session => !session.stopping && !session.window.isDestroyed()).map(session => session.window) }
  getSources() { return [...this.sessions.values()].filter(session => !session.stopping && !session.window.isDestroyed())
    .map(session => ({ window: session.window, platform: session.target.platform!, deviceKey: session.info.deviceKey,
      claimGui: () => session.automation?.guiOpened(false) })) }
  private trackRecovery(session: Session, work: Promise<void>) {
    const recovery = work.catch(() => {}).finally(() => {
      if (session.recovery === recovery) session.recovery = undefined
    })
    session.recovery = recovery
    return recovery
  }
  async reconcileIos(targets: ITarget[]) {
    const ready = new Set(targets.filter(target => target.state === 'ready').map(target => target.key))
    await Promise.all([...this.sessions.values()].map(async session => {
      if (session.target.platform !== 'ios' || session.target.transport !== 'usb' || session.stopping || session.window.isDestroyed()) return
      const missing = !ready.has(session.info.deviceKey)
      const removed = missing && !session.usbMissing
      session.usbMissing = missing
      if (removed) {
        for (const call of session.setupCalls) call.abort(Error('cancelled'))
        session.reconnectPending = true
        this.state(session, 'disconnected'); session.gate.reset()
        const backend = session.backend
        // Stop the transport even if a previous discovery is still enabling video.
        // Its finalizer must not release the reservation for this unplug cleanup.
        return this.trackRecovery(session, Promise.allSettled([session.recovery, backend?.close()]).then(async () => {
          if (session.stopping) return
          session.reconnectPending = true
          if (session.info.state !== 'disconnected') this.state(session, 'disconnected')
          if (session.backend !== backend) await session.backend?.close()
        }))
      }
      if (session.recovery) return session.recovery
      if (missing || session.manualSetup) return
      if (!session.reconnectPending) {
        const backend = session.backend
        if (!session.starting && session.info.state === 'running' && session.info.videoMode === 'video-error' &&
          session.videoRequested && session.videoRetriesLeft && Date.now() >= (session.nextVideoRetry || 0) && backend instanceof IosMirror) {
          session.videoRetriesLeft--
          return this.trackRecovery(session, this.enableIosVideo(session, backend))
        }
        return
      }
      return this.trackRecovery(session, this.open(session).then(() => {
        if (!session.usbMissing) session.reconnectPending = false
      }))
    }))
  }
  async start(target: ITarget, gui = true) {
    if (this.disposed) throw new Error('Mirrors closed')
    const receiver = target.platform === 'ios' && target.transport !== 'usb'
    const key = receiver ? 'ios:airplay-receiver' : target.key
    const existing = [...this.sessions.values()].find(session => session.info.deviceKey === key)
    if (existing) {
      if (existing.stopping || existing.window.isDestroyed()) { await this.stop(existing.info.id); return this.start(target, gui) }
      else {
        if (gui) {
          if (existing.window.focusMirrorTile) {
            existing.automation?.guiOpened(false)
            await existing.window.focusMirrorTile()
          } else if (existing.automation) existing.automation.guiOpened()
          else existing.window.focus()
        }
        if (existing.ready && ['error', 'disconnected'].includes(existing.info.state)) await this.open(existing)
        return
      }
    }
    this.init()
    const id = randomUUID()
    // Chromium can withhold VideoDecoder from file pages with web security disabled.
    const win = windows.create({
      name: `native-mirror-${encodeURIComponent(key)}`, webSecurity: true, detachable: true,
      width: 480, height: 800, minWidth: 320, minHeight: 400,
    })
    const contents = win.mirrorView?.webContents ?? win.webContents
    const session: Session = { info: { id, deviceKey: key, name: receiver ? 'Scrcpy Plus' : target.name,
      platform: target.platform!, state: 'starting' }, target: receiver
      ? { ...target, key, name: 'AirPlay', connectionId: undefined, transport: 'receiver' } : { ...target },
      window: win, contents, ready: false, gate: new FrameGate(), setupCalls: new Set(), videoRequested: target.platform === 'ios' && target.transport === 'usb' }
    this.sessions.set(id, session)
    session.automation = this.automationHooks?.({ target: session.target, window: win, contents, gui, close: () => this.stop(id) })
    win.on('close', event => { if (session.automation?.closeRequested()) event.preventDefault() })
    contents.on('did-start-navigation', details => {
      if (details.isMainFrame && !details.isSameDocument) {
        for (const call of session.setupCalls) call.abort(Error('cancelled'))
        session.ready = false; session.gate.reset()
        if (session.backend) void this.stop(id).catch(() => {})
      }
    })
    contents.on('did-navigate', () => { session.ready = true })
    contents.on('render-process-gone', () => { session.ready = false; void this.stop(id).catch(() => {}) })
    win.on('closed', () => {
      const restoreMain = session.automation?.closed() ?? true
      session.ready = false; void this.stop(id).catch(() => {})
      if (restoreMain) windows.getWin('main')?.show()
    })
    windows.loadPage(win, { page: 'native-mirror' })
  }
  private state(session: Session, value: string) {
    if (session.stopping || this.sessions.get(session.info.id) !== session) return
    if (['screenshot', 'video-starting', 'video', 'video-error'].includes(value)) {
      if (value === 'video-error') session.nextVideoRetry = Date.now() + 5000
      session.info.videoMode = value as MirrorSession['videoMode']
      if (session.ready && !session.window.isDestroyed()) session.contents.send('nativeMirrorState', { ...session.info })
      return
    }
    if (value === 'connected') session.hasConnected = true
    if (session.hasConnected && session.target.platform === 'ios' && session.target.transport === 'usb' &&
      (value === 'disconnected' || value === 'error')) session.reconnectPending = true
    if (value !== 'error') delete session.info.connectionIssue
    session.automation?.state(value)
    session.info.state = value === 'connected' ? 'running' : value as MirrorSession['state']
    if (session.ready && !session.window.isDestroyed()) session.contents.send('nativeMirrorState', { ...session.info })
  }
  private async recoverRunner(session: Session, signal: AbortSignal) {
    signal.throwIfAborted()
    if (session.stopping || session.usbMissing || !session.target.connectionId ||
      (session.lastRunnerRecovery && Date.now() - session.lastRunnerRecovery < 60000)) throw Error('WDA recovery unavailable')
    session.lastRunnerRecovery = Date.now()
    await recoverManagedIos(session.target.connectionId, signal)
    signal.throwIfAborted()
  }
  private async enableIosVideo(session: Session, backend: IosMirror) {
    const enable = async () => {
      if (session.backend === backend && session.videoRequested && !session.stopping && !session.usbMissing)
        await backend.setVideo(true)
    }
    try { await (session.automation ? session.automation.input(undefined, enable) : enable()) }
    catch (error) {
      // video-error is emitted only after cleanup and a fresh screenshot.
      if (session.info.videoMode !== 'video-error') throw error
      console.warn('ReplayKit returned to screenshot mode:', error instanceof Error ? error.message : 'unknown')
    }
  }
  private open(session: Session): Promise<void> {
    if (session.stopping || session.usbMissing) return Promise.reject(new Error('Mirror device unavailable'))
    if (session.manualSetup) return Promise.reject(new Error('iOS setup in progress'))
    if (session.starting) return session.starting
    if (session.backend && !['error', 'disconnected'].includes(session.info.state)) return Promise.resolve()
    let backend: AndroidMirror | AirplayMirror | IosMirror | undefined = session.backend
    session.starting = (async () => {
      if (session.target.platform === 'ios' && session.target.transport === 'usb') {
        const call = new AbortController(); session.setupCalls.add(call)
        try {
          try { await session.backend?.close() }
          catch (error) {
            if (!session.hasConnected) throw error
            await this.recoverRunner(session, call.signal)
            // A replacement Runner must still pass the old backend's ownership checks.
            await session.backend?.close()
          }
          call.signal.throwIfAborted()
          try { await prepareManagedIos(session.target.connectionId!, call.signal) }
          catch (error) {
            if ((error as Error).message !== 'status-unknown') throw error
            await this.recoverRunner(session, call.signal)
            await prepareManagedIos(session.target.connectionId!, call.signal)
          }
          call.signal.throwIfAborted()
        } finally { session.setupCalls.delete(call) }
      } else await session.backend?.close()
      session.gate.reset()
      if (session.stopping || session.usbMissing) throw new Error('Mirror device unavailable')
      backend = session.target.platform === 'android' ? new AndroidMirror(session.target) : session.target.transport === 'usb' ? new IosMirror(session.target) : new AirplayMirror()
      session.videoRetriesLeft = session.hasConnected || session.lastRunnerRecovery ? 3 : 0
      session.backend = backend
      if (backend instanceof IosMirror) session.info.videoMode = session.videoRequested ? 'video-starting' : 'screenshot'
      this.state(session, 'starting')
      await backend.start(frame => {
        if (!session.ready || session.stopping || session.usbMissing || session.backend !== backend || session.window.isDestroyed()) return
        const packet = session.gate.push(frame)
        if (packet) session.contents.send('nativeMirrorFrame', { ...packet, sessionId: session.info.id })
      }, value => { if (!session.usbMissing && session.backend === backend) this.state(session, value) })
      if (backend instanceof IosMirror && session.videoRequested) await this.enableIosVideo(session, backend)
    })().catch(async error => {
      let cleaned = false, cleanupError: unknown
      try { await backend?.close(); cleaned = true } catch (failure) { cleanupError = failure }
      if (!session.stopping) {
        if (cleaned) session.backend = undefined
        const message = error && typeof error.message === 'string' ? error.message : ''
        if (session.target.platform === 'android' && /LIBUSB_ERROR_(ACCESS|BUSY)|device is already in use/i.test(message)) {
          session.info.connectionIssue = 'usb-access'
        }
        if (session.target.platform === 'ios' && session.target.transport === 'usb') {
          const failure = (cleanupError || error) as { code?: string } | undefined
          session.info.connectionIssue = failure?.code === 'IOS_WDA_ALLOCATION_UNKNOWN' ? 'ios-cleanup-unknown'
            : failure?.code === 'IOS_WDA_UPDATE_REQUIRED' ? 'ios-wda-update' : 'ios-wda'
        }
        this.state(session, 'error')
      }
      console.error('Native mirror startup failed:', error instanceof Error ? error.message : 'unknown')
      throw new Error('Native mirror connection failed')
    }).finally(() => { session.starting = undefined })
    return session.starting
  }

  stop(id: string, reason: 'force' | 'gui' = 'force'): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) return Promise.resolve()
    if (reason === 'gui' && session.automation?.closeRequested()) return Promise.resolve()
    if (session.stopping) return session.stopping
    for (const call of session.setupCalls) call.abort(Error('cancelled'))
    const wasReady = session.ready
    session.automation?.state('stopping')
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
  inputBackend(key: string, geometry?: { width: number; height: number }) {
    const session = [...this.sessions.values()].find(session => session.info.deviceKey === key)
    if (!session || !session.ready || session.stopping || !(session.backend instanceof AndroidMirror)) throw new Error('Control unavailable')
    const backend = session.backend
    return (input: NativeMirrorInput) => { validateNativeInput(input); return backend.input(input, geometry) }
  }
  iosInput(key: string, action: InputAction, geometry: { width: number; height: number; rotation?: number } | undefined, signal: AbortSignal) {
    const session = [...this.sessions.values()].find(session => session.info.deviceKey === key)
    if (!session || !session.ready || session.stopping || !(session.backend instanceof IosMirror)) throw new Error('iOS control unavailable')
    return session.backend.perform(action, geometry, signal)
  }
  async dispose() { this.disposed = true; await Promise.all([...this.sessions.keys()].map(id => this.stop(id))) }
  private owner(event: Electron.IpcMainInvokeEvent) {
    const session = [...this.sessions.values()].find(session => session.contents === event.sender)
    if (!session || !session.ready || session.stopping || event.senderFrame !== event.sender.mainFrame) throw new Error('Mirror document unavailable')
    return session
  }
  private init() {
    if (this.initialized) return
    this.initialized = true
    ipcMain.handle('nativeMirrorInfo', event => { const s = this.owner(event); return { id: s.info.id, target: s.target, state: s.info.state, connectionIssue: s.info.connectionIssue, videoMode: s.info.videoMode } })
    ipcMain.handle('iosSetup', async (event, action: IosSetupAction) => {
      const session = this.owner(event)
      if (session.target.platform !== 'ios' || session.target.transport !== 'usb' || !session.target.connectionId) throw Error('device-unavailable')
      const prepares = ['login','team','prepare'].includes(action?.action)
      if (prepares && session.manualSetup) throw Error('busy')
      const call = new AbortController()
      session.setupCalls.add(call)
      if (prepares) session.manualSetup = call
      try {
        if (prepares) {
          if (session.recovery) await session.recovery.catch(() => {})
          if (session.starting) await session.starting.catch(() => {})
          call.signal.throwIfAborted()
          if (session.backend) {
            await session.backend.close()
            call.signal.throwIfAborted()
            session.backend = undefined
            this.state(session, 'disconnected'); session.gate.reset()
          }
          // The setup dialog opens the mirror once preparation succeeds.
          session.reconnectPending = false
        }
        call.signal.throwIfAborted()
        return await iosSetup(session.target.connectionId, action, call.signal)
      } finally {
        if (session.manualSetup === call) session.manualSetup = undefined
        session.setupCalls.delete(call)
      }
    })
    ipcMain.handle('nativeMirrorOpen', (event, restart?: boolean) => {
      const session = this.owner(event)
      if (restart !== undefined && typeof restart !== 'boolean') throw new Error('Invalid reconnect request')
      if (restart && !session.starting) this.state(session, 'disconnected')
      return this.open(session)
    })
    ipcMain.handle('nativeMirrorVideo', (event, enabled: boolean, reason?: 'decode-error') => {
      const session = this.owner(event)
      if (typeof enabled !== 'boolean' || !(session.backend instanceof IosMirror)) throw new Error('Video control unavailable')
      if (reason !== undefined && (reason !== 'decode-error' || enabled)) throw new Error('Invalid video fallback')
      const backend = session.backend
      if (!reason) session.videoRequested = enabled
      const run = async () => {
        if (backend !== session.backend || session.stopping) return
        try {
          await backend.setVideo(enabled)
          if (reason && session.videoRequested) this.state(session, 'video-error')
        }
        catch (error) {
          if ((error as { code?: string })?.code === 'IOS_WDA_ALLOCATION_UNKNOWN') {
            session.info.connectionIssue = 'ios-cleanup-unknown'; this.state(session, 'error')
          }
          throw error
        }
      }
      return session.automation ? session.automation.input(undefined, run) : run()
    })
    ipcMain.handle('nativeMirrorFit', (event, width: number, height: number, verticalInset: number, horizontalInset: number) => {
      const win = this.owner(event).window
      if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 16384) ||
        ![verticalInset, horizontalInset].every(value => Number.isFinite(value) && value >= 0 && value <= 512)) throw new Error('Invalid mirror dimensions')
      win.mirrorRatio = width / height
      if (win.mirrorHost || win.isMaximized() || win.isFullScreen()) return
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
      const backend = session.backend
      if (!(backend instanceof AndroidMirror) && !(backend instanceof IosMirror)) throw new Error('Control unsupported')
      const normalized = input.type === 'touch' && input.action === 'cancel' && backend instanceof AndroidMirror && !(backend instanceof IosMirror) ? { ...input, action: 'up' as const } : input
      const run = () => backend.input(normalized, input.display)
      return session.automation ? session.automation.input(input.type === 'touch' ? input.action === 'cancel' ? 'up' : input.action : undefined, run) : run()
    })
  }
}
export const nativeMirrors = new NativeMirrors()
