import type { ITarget, NativeMirrorInput } from 'common/types'
import { UnsafeInputFault, type InputAction } from '../../automation/input'
import type { NativeFrame } from './media'
import { WdaClient, pngSize } from './ios-wda'
import { IosVideo } from './ios-video'
import { ownershipRunner, WdaAllocation } from './ios-ownership'

export interface IosGeometry { width: number; height: number; rotation: number }
interface Gesture { geometry: IosGeometry; points: Array<{ x: number; y: number; at: number }> }
const same = (a: IosGeometry, b: IosGeometry) => a.width === b.width && a.height === b.height && a.rotation === b.rotation

export class IosMirror {
  readonly client: WdaClient
  private sessionId?: string
  private runnerId?: string
  private allocation = new WdaAllocation()
  private lifetime = new AbortController()
  private inputLifetime = new AbortController()
  private closed = false
  private unsafe = false
  private startWork?: Promise<void>
  private closing?: Promise<void>
  private readWork?: Promise<void>
  private timer?: ReturnType<typeof setTimeout>
  private readFailures = 0
  private tail: Promise<unknown> = Promise.resolve()
  private pending = 0
  private gesture?: Gesture
  private geometry?: IosGeometry
  private video?: IosVideo
  private videoWork?: Promise<void>
  private frame?: (frame: NativeFrame) => void
  private state?: (state: string) => void
  constructor(target: ITarget) {
    if (target.transport !== 'usb' || !target.connectionId || target.key !== `ios:${target.connectionId}`) throw new Error('Invalid iOS USB target')
    this.client = new WdaClient(target.connectionId)
  }
  start(frame: (frame: NativeFrame) => void, state: (state: string) => void) {
    if (this.startWork) return this.startWork
    this.frame = frame; this.state = state
    this.startWork = (async () => {
      this.check()
      const status = await this.client.request('GET', '/status', undefined, this.lifetime.signal)
      this.runnerId = ownershipRunner(status)
      if (status.sessionId) throw new Error('WDA already in use; use a dedicated runner')
      // Do not cancel session creation mid-response: close waits for the bounded
      // result so it can delete exactly the session it created.
      this.allocation.begin(this.runnerId)
      const result = await this.client.request('POST', '/session', { scrcpyPlusRunnerId: this.runnerId, capabilities: { alwaysMatch: {} } })
      if (result.value?.scrcpyPlusSessionBusy || result.value?.scrcpyPlusRunnerChanged) {
        this.allocation.settled()
        throw new Error('WDA ownership changed; retry with a dedicated runner')
      }
      const id = result.value?.sessionId
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid WDA session identifier')
      this.sessionId = id; this.allocation.settled()
      this.check()
      await this.client.request('POST', this.path('/appium/settings'), { settings: { screenshotQuality: 0 } }, this.lifetime.signal)
      await this.capture()
      this.schedule()
    })()
    return this.startWork
  }
  private report(state: string) {
    if (state === 'disconnected' || state === 'error') {
      this.inputLifetime.abort(); this.gesture = undefined
    } else if (state === 'connected' && this.inputLifetime.signal.aborted) this.inputLifetime = new AbortController()
    this.state?.(state)
  }
  private check(signal?: AbortSignal) {
    if (this.closed) throw new Error('iOS session closed')
    this.lifetime.signal.throwIfAborted(); signal?.throwIfAborted()
  }
  private path(route: string) {
    if (!this.sessionId) throw new Error('WDA session unavailable')
    return `/session/${this.sessionId}${route}`
  }
  private async readGeometry(signal = this.lifetime.signal): Promise<IosGeometry> {
    const screen = (await this.client.request('GET', this.path('/wda/screen'), undefined, signal)).value
    const rotation = (await this.client.request('GET', this.path('/rotation'), undefined, signal)).value?.z
    const w = screen?.screenSize?.width, h = screen?.screenSize?.height
    if (![w,h].every(n => Number.isFinite(n) && n > 0 && n <= 16384) || ![0,90,180,270].includes(rotation)) throw new Error('Invalid iOS screen geometry')
    return { width: rotation % 180 ? Math.max(w,h) : Math.min(w,h), height: rotation % 180 ? Math.min(w,h) : Math.max(w,h), rotation }
  }
  private capture(): Promise<void> {
    if (this.readWork) return this.readWork
    this.readWork = (async () => {
      const geometry = await this.readGeometry()
      const encoded = (await this.client.request('GET', this.path('/screenshot'), undefined, this.lifetime.signal)).value
      if (typeof encoded !== 'string' || encoded.length > 44 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid WDA screenshot')
      const data = Buffer.from(encoded, 'base64'), size = pngSize(data)
      const rotation = (await this.client.request('GET', this.path('/rotation'), undefined, this.lifetime.signal)).value?.z
      if (rotation !== geometry.rotation || Math.abs(size.width / size.height - geometry.width / geometry.height) > 0.01) throw new Error('iOS screen changed during capture')
      this.check()
      this.geometry = geometry
      this.frame?.({ data, timestamp: Date.now() * 1000, format: 'png', rotation })
      this.report('connected')
    })().finally(() => { this.readWork = undefined })
    return this.readWork
  }
  private schedule() {
    if (this.closed) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      const read = this.video ? this.readGeometry().then(async geometry => {
        if (this.geometry && !same(geometry, this.geometry)) await this.setVideo(false)
      }) : this.capture()
      void read.then(() => {
        if (this.readFailures) this.report('connected')
        this.readFailures = 0; this.schedule()
      }, error => {
        if (this.closed) return
        console.warn('iOS frame polling failed:', error instanceof Error ? error.message : 'unknown')
        this.report('disconnected')
        // Only retry observation. Never recreate sessions or replay input writes.
        if (++this.readFailures < 3) this.schedule()
      })
    }, this.readFailures ? 1000 : 700)
  }
  setVideo(enabled: boolean): Promise<void> {
    this.check()
    if (this.videoWork) {
      if (!enabled) return this.videoWork.catch(() => {}).then(() => this.setVideo(false))
      return Promise.reject(new Error('iOS video transition in progress'))
    }
    if (enabled && this.video) return Promise.resolve()
    clearTimeout(this.timer)
    this.videoWork = (async () => {
      await this.readWork?.catch(() => {})
      this.check()
      if (!enabled) {
        try {
          await this.video?.close(); this.video = undefined
          await this.capture(); this.report('screenshot'); return
        } catch (error) { this.report('error'); throw error }
      }
      if (!this.sessionId || !this.geometry) throw new Error('iOS screenshot required before video')
      await this.validateGeometry(this.geometry)
      this.report('video-starting')
      const video = new IosVideo(this.client, this.sessionId, this.geometry, frame => {
        if (!this.closed && this.video === video) this.frame?.(frame)
      }, () => {
        void Promise.resolve().then(async () => {
          await this.videoWork?.catch(() => {})
          if (this.closed || this.video !== video) return
          try { await this.setVideo(false); this.report('video-error') }
          catch { if (!this.closed) this.report('error') }
        })
      }, this.runnerId!)
      this.video = video
      try { await video.start(); this.check(); this.report('video') }
      catch (error) {
        try { await video.close() } catch (cleanupError) { this.report('error'); throw cleanupError }
        this.video = undefined
        if (!this.closed) {
          try { await this.capture(); this.report('video-error') }
          catch (captureError) { this.report('error'); throw captureError }
        }
        throw error
      }
    })().finally(() => { this.videoWork = undefined; this.schedule() })
    return this.videoWork
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= 64) return Promise.reject(new Error('iOS input queue full'))
    this.pending++
    const task = this.tail.then(() => { this.check(); if (this.unsafe) throw new UnsafeInputFault(); return operation() })
      .finally(() => { this.pending-- })
    this.tail = task.catch(() => {})
    return task
  }
  private async validateGeometry(expected: IosGeometry, signal?: AbortSignal) {
    this.check(signal)
    const current = await this.readGeometry(signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal)
    if (!same(current, expected)) throw new Error('iOS display changed; capture again')
    return current
  }
  private async write(route: string, body: unknown, signal?: AbortSignal) {
    this.check(signal)
    const duration = route.startsWith('/mobilerun/actions') && Array.isArray(body) ? body.reduce((sum, action) => sum + (Number(action.duration) || 0), 0) : 0
    try { await this.client.request('POST', this.path(route), body, signal ? AbortSignal.any([signal,this.lifetime.signal]) : this.lifetime.signal, 10000 + Math.min(10000, duration)) }
    catch { this.unsafe = true; throw new UnsafeInputFault() }
  }
  private actions(geometry: IosGeometry, points: Array<{ x: number; y: number; at: number }>, releasedAt?: number) {
    const position = (p: { x: number; y: number }) => ({ x: Math.min(geometry.width - 1, p.x * geometry.width), y: Math.min(geometry.height - 1, p.y * geometry.height) })
    const result: Array<Record<string, unknown>> = [{ type: 'pointerDown', ...position(points[0]) }]
    // A desktop drag can arrive as just a down and an up at different positions.
    // Give XCTest a sampled path even when the mouse events share a timestamp.
    if (releasedAt !== undefined && points.length === 2) {
      const [a, b] = points
      const distance = Math.hypot((b.x - a.x) * geometry.width, (b.y - a.y) * geometry.height)
      if (distance >= 10) {
        const duration = Math.max(120, b.at - a.at)
        points = [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, at: a.at + Math.round(duration / 2) }, { ...b, at: a.at + duration }]
      }
    }
    for (let i = 1; i < points.length; i++) result.push({ type: 'pointerMove', ...position(points[i]), duration: Math.max(1, Math.min(10000, points[i].at - points[i-1].at)) })
    const hold = Math.max(points.length === 1 ? 50 : 0, (releasedAt ?? points[points.length - 1].at) - points[points.length - 1].at)
    if (hold) result.push({ type: 'pause', duration: hold })
    result.push({ type: 'pointerUp' })
    return result
  }
  input(input: NativeMirrorInput, expected?: { width: number; height: number; rotation?: number }) {
    const receivedAt = Date.now(), signal = this.inputLifetime.signal
    return this.enqueue(async () => {
      if (input.type === 'touch' && input.action === 'cancel') { this.gesture = undefined; return }
      this.check(signal)
      const geometry = this.geometry
      if (!geometry) throw new Error('iOS screen unavailable')
      if ((input.type === 'touch' && input.action === 'down') || input.type === 'scroll') this.validateDisplay(expected, geometry)
      if (input.type === 'touch') {
        if (![input.x,input.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('Invalid iOS input position')
        if (input.action === 'down') {
          if (this.gesture) throw new Error('iOS gesture already active')
          if (expected?.rotation !== undefined && expected.rotation !== geometry.rotation) throw new Error('iOS display changed')
          this.gesture = { geometry: { ...geometry }, points: [{ x: input.x, y: input.y, at: receivedAt }] }; return
        }
        const gesture = this.gesture
        if (!gesture) return
        if (receivedAt - gesture.points[0].at > 10000 || gesture.points.length >= 640) { this.gesture = undefined; throw new Error('iOS gesture too long') }
        const previous = gesture.points[gesture.points.length - 1]
        if (previous.x !== input.x || previous.y !== input.y) gesture.points.push({ x: input.x, y: input.y, at: receivedAt })
        if (input.action !== 'up') return
        this.gesture = undefined
        await this.validateGeometry(gesture.geometry, signal)
        await this.write('/mobilerun/actions?scale=1', this.actions(gesture.geometry, gesture.points, receivedAt), signal)
      } else if (input.type === 'scroll') {
        await this.validateGeometry(geometry, signal)
        const end = { x: Math.max(0, Math.min(1, input.x + input.dx / 2)), y: Math.max(0, Math.min(1, input.y + input.dy / 2)), at: 250 }
        await this.write('/mobilerun/actions?scale=1', this.actions(geometry, [{ x: input.x, y: input.y, at: 0 }, end]), signal)
      } else if (input.type === 'text') await this.text(input.text, signal)
      else await this.key(input.keyCode, signal)
    })
  }
  private async text(text: string, signal?: AbortSignal) {
    if (typeof text !== 'string' || text.length > 16384 || text.includes('\0')) throw new Error('Invalid iOS text')
    await this.write('/keys', { value: [...text] }, signal)
  }
  private async key(code: number, signal?: AbortSignal) {
    const text: Record<number, string> = { 66: '\n', 67: '\b', 61: '\t' }
    if (text[code]) return this.text(text[code], signal)
    const names: Record<number, string> = { 3: 'home', 24: 'volumeUp', 25: 'volumeDown' }
    if (!names[code]) throw new Error('Unsupported iOS key')
    await this.write('/wda/pressButton', { name: names[code] }, signal)
  }
  private validateDisplay(expected: { width: number; height: number; rotation?: number } | undefined, geometry: IosGeometry) {
    if (!expected || ![expected.width,expected.height].every(n => Number.isFinite(n) && n > 0) ||
      expected.rotation !== geometry.rotation || Math.abs(expected.width / expected.height - geometry.width / geometry.height) > .01) throw new Error('iOS display changed; capture again')
  }
  perform(action: InputAction, expected: { width: number; height: number; rotation?: number } | undefined, signal?: AbortSignal) {
    return this.enqueue(async () => {
      this.check(signal)
      if (action.type === 'text') return this.text(action.text, signal)
      if (action.type === 'key') {
        const codes: Record<string, number> = { home: 3, enter: 66, backspace: 67, tab: 61, 'volume-up': 24, 'volume-down': 25 }
        return this.key(codes[action.key], signal)
      }
      const geometry = this.geometry
      if (!geometry || !expected) throw new Error('iOS display unavailable')
      this.validateDisplay(expected, geometry)
      const normalize = (x: number, y: number) => {
        if (![x,y].every(Number.isFinite) || x < 0 || x >= expected.width || y < 0 || y >= expected.height) throw new Error('Invalid iOS position')
        return { x: x / expected.width, y: y / expected.height }
      }
      const points = [{ ...normalize(action.x,action.y), at: 0 }]
      if (action.type === 'swipe') {
        if (!Number.isInteger(action.durationMs) || action.durationMs < 1 || action.durationMs > 10000) throw new Error('Invalid iOS gesture duration')
        points.push({ ...normalize(action.toX,action.toY), at: action.durationMs })
      } else if (action.type === 'scroll') {
        if (![action.dx,action.dy].every(n => Number.isFinite(n) && Math.abs(n) <= 1)) throw new Error('Invalid iOS scroll')
        points.push({ x: Math.max(0,Math.min(1,points[0].x + action.dx / 2)), y: Math.max(0,Math.min(1,points[0].y + action.dy / 2)), at: 250 })
      } else if (action.type !== 'tap') throw new Error('Unsupported iOS action')
      await this.validateGeometry(geometry, signal)
      await this.write('/mobilerun/actions?scale=1', this.actions(geometry, points), signal)
    })
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true; this.lifetime.abort(); clearTimeout(this.timer); this.gesture = undefined
    this.closing = (async () => {
      await this.startWork?.catch(() => {})
      await this.allocation.confirmCleanup(this.client)
      await this.video?.close()
      await this.videoWork?.catch(() => {})
      await this.video?.close(); this.video = undefined
      await this.tail; await this.readWork?.catch(() => {})
      if (this.sessionId) {
        try { await this.client.request('DELETE', this.path(''), undefined, undefined, 5000) }
        catch (error) {
          // A restarted runner no longer knows our session. Confirm that before
          // releasing ownership; an unreachable or unchanged runner must fail.
          const status = await this.client.request('GET', '/status', undefined, undefined, 5000)
          if (status.sessionId === this.sessionId || status.value?.ready !== true) throw error
        }
        this.sessionId = undefined
      }
    })().catch(error => { this.closing = undefined; throw error })
    return this.closing
  }
}
