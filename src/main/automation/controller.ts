import { setTimeout as delay } from 'node:timers/promises'
import type { DeviceDiscovery, ITarget } from '../../common/types'
import type { AutomationContext } from '../../common/automation/protocol'
import { AutomationFault, checkContext } from '../../common/automation/protocol'
import { AutomationSessions } from './sessions'
import { FrameLedger } from './frames'
import type { CaptureOptions } from './frames'
import { AutomationFrameBridge } from './frameBridge'
import { DeviceInputQueue, executeInput } from './input'
import type { InputAction, InputBackend } from './input'
import type { AutomationWindowHooks } from './windowHooks'
interface ControllerOptions {
  instanceId: string
  ipc: ConstructorParameters<typeof AutomationFrameBridge>[0]
  discover(): Promise<DeviceDiscovery>
  open(target: ITarget, gui: boolean): Promise<unknown>
  input?: (target: ITarget, context: AutomationContext) => InputBackend
  perform?: (source: Parameters<AutomationWindowHooks>[0], action: InputAction, geometry: { width: number; height: number } | undefined, context: AutomationContext) => Promise<void>
}
export class AutomationController {
  readonly sessions: AutomationSessions
  readonly queue = new DeviceInputQueue()
  private frames = new FrameLedger()
  private bridge: AutomationFrameBridge
  private sources = new Map<string, Parameters<AutomationWindowHooks>[0]>()
  constructor(private options: ControllerOptions) {
    this.sessions = new AutomationSessions(options.instanceId)
    this.bridge = new AutomationFrameBridge(options.ipc)
  }
  readonly attach: AutomationWindowHooks = source => {
    const { target, window, close } = source
    const contents = window.webContents
    let gui = source.gui, restoreMain = gui
    const id = this.sessions.register(target, { close, hide: () => window.hide(), show: () => { window.show(); window.focus() } }, gui)
    this.sources.set(id, source)
    const state = (value: string) => {
      if (!['starting','authorizing','waiting','error','disconnected','stopping'].includes(value)) return
      this.frames.invalidate(id)
      this.sessions.setState(id, value as 'starting' | 'authorizing' | 'waiting' | 'error' | 'disconnected' | 'stopping')
      // Abort existing actions on backend reset/disconnect. A new presentation
      // permits a fresh queue only after the old generation has been invalidated.
      this.queue.discard(target.key)
    }
    const unregister = this.bridge.register(contents, report => {
      if (report.state === 'presented') {
        if (['error','disconnected','stopping','stopped'].includes(this.sessions.get(id).state)) return
        this.frames.observe(id, report.metadata)
        this.sessions.setState(id, 'running')
      } else state(report.state)
    })
    const crash = () => {
      state('error')
      void Promise.resolve().then(() => this.sessions.terminate(id)).catch(() => {})
    }
    const navigation = (details: { isMainFrame: boolean; isSameDocument: boolean }) => { if (details.isMainFrame && !details.isSameDocument) state('starting') }
    contents.on('render-process-gone', crash)
    contents.on('did-start-navigation', navigation)
    return {
      state,
      guiOpened: () => { gui = true; restoreMain = true; this.sessions.claimGui(id) },
      closeRequested: () => {
        const retained = this.sessions.releaseGui(id)
        restoreMain = gui && !retained; gui = false
        return retained
      },
      closed: () => {
        contents.removeListener('render-process-gone', crash)
        contents.removeListener('did-start-navigation', navigation)
        unregister(); this.frames.invalidate(id); this.queue.discard(target.key)
        this.sources.delete(id); this.sessions.closed(id)
        return restoreMain
      },
      input: (phase, operation) => this.queue.gui(target.key, phase, operation),
    }
  }
  async start(deviceKey: string, context: AutomationContext) {
    checkContext(context)
    const found = await this.options.discover()
    const device = found.targets.find(item => item.key === deviceKey)
    if (!device) throw new AutomationFault(found.errors.length ? 'UNAVAILABLE' : 'NOT_FOUND', 'Device not found')
    if (device.state === 'offline' || (device.platform === 'harmony' && device.state !== 'ready')) throw new AutomationFault('UNAVAILABLE', 'Device is not ready or needs authorization')
    const target = device.platform === 'ios' ? { ...device, key: 'ios:airplay-receiver', name: 'AirPlay', connectionId: undefined, transport: 'receiver' as const } : device
    return this.sessions.start(target, context, () => this.options.open(target, false))
  }
  private source(id: string) {
    const info = this.sessions.get(id), source = this.sources.get(id)
    if (!source || source.window.isDestroyed() || ['error','disconnected','stopping','stopped'].includes(info.state)) throw new AutomationFault('UNAVAILABLE', 'Session is not available')
    return source
  }
  async capture(id: string, options: CaptureOptions, context: AutomationContext) {
    while (true) {
      checkContext(context)
      const source = this.source(id)
      try {
        const result = await this.bridge.request(source.window.webContents, 'capture', context)
        const frame = this.frames.issue(id, result.metadata, options)
        return { frame, bytes: result.png! }
      } catch (error) {
        if (!(error instanceof AutomationFault) || error.code !== 'UNAVAILABLE') throw error
        this.source(id)
      }
      try { await delay(Math.max(1, Math.min(50, context.deadline - Date.now())), undefined, { signal: context.signal }) }
      catch { checkContext(context) }
    }
  }
  async input(id: string, action: InputAction, frameId: string | undefined, context: AutomationContext) {
    const info = this.sessions.requireLease(id, context.clientId)
    if (info.platform === 'ios') throw new AutomationFault('UNSUPPORTED', 'iOS reception is view-only')
    const source = this.source(id)
    if (info.state !== 'running') throw new AutomationFault('UNAVAILABLE', 'Session has not presented a frame')
    return this.queue.automatic(info.deviceKey, context, async current => {
      this.sessions.requireLease(id, current.clientId); this.source(id)
      const latest = await this.bridge.request(source.window.webContents, 'metadata', current)
      this.frames.observe(id, latest.metadata)
      const geometry = ['tap','swipe','scroll'].includes(action.type) ? this.frames.geometry(id, frameId || '') : undefined
      if (this.options.perform) await this.options.perform(source, action, geometry, current)
      else await executeInput(action, geometry, this.options.input!(source.target, current), current)
      try {
        const after = await this.bridge.request(source.window.webContents, 'metadata', current)
        return { observationToken: this.frames.barrier(id, after.metadata) }
      } catch { throw new AutomationFault('OUTCOME_UNKNOWN', 'Input completed but its observation barrier could not be established', 'unknown') }
    })
  }
}
