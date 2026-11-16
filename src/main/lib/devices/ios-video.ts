import type net from 'node:net'
import type { WdaClient } from './ios-wda'
import type { NativeFrame } from './media'
import { connectIos } from './ios-usbmux'

export class IosVideoParser {
  private buffered = Buffer.alloc(0)
  constructor(private frame: (frame: NativeFrame) => void) {}
  push(chunk: Uint8Array) {
    this.buffered = Buffer.concat([this.buffered, chunk])
    while (this.buffered.length >= 12) {
      const size = this.buffered.readUInt32BE(8)
      if (!size || size > 8 * 1024 * 1024) throw new Error('Invalid iOS video packet size')
      if (this.buffered.length < size + 12) return
      const flags = this.buffered.readBigUInt64BE(0), pts = flags & ((1n << 62n) - 1n)
      if (pts > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid iOS video timestamp')
      const data = new Uint8Array(this.buffered.subarray(12, 12 + size))
      this.buffered = this.buffered.subarray(12 + size)
      this.frame({ data, timestamp: Number(pts), config: !!(flags & (1n << 63n)), keyFrame: !!(flags & (1n << 62n)) })
    }
  }
}

export class IosVideo {
  private socket?: net.Socket
  private captureId?: number
  private abort = new AbortController()
  private closed = false
  private ready = false
  private failureReported = false
  private starting?: Promise<void>
  private closing?: Promise<void>
  private watchdog?: ReturnType<typeof setTimeout>
  constructor(private client: WdaClient, private session: string,
    private geometry: { width: number; height: number; rotation: number },
    private frame: (frame: NativeFrame) => void, private failed: () => void) {}
  private path(route: string) { return `/session/${this.session}/mobilerun/screencapture${route}` }
  start() {
    if (this.starting) return this.starting
    this.starting = this.open()
    return this.starting
  }
  private async open() {
    const status = (await this.client.request('GET', this.path('/broadcast'), undefined, this.abort.signal)).value
    if (!status || !['idle','connected'].includes(status.state) || !Array.isArray(status.sessions) || !Array.isArray(status.audioSessions) || (status.state === 'idle' && (status.sessions.length || status.audioSessions.length))) throw new Error('iOS capture already in use')
    // Requests allocating remote resources finish with a bounded response even on
    // close, so cleanup learns the exact ID. Never retry an ambiguous allocation.
    const capture = (await this.client.request('POST', this.path('/start'), {
      codec: 'h264', framing: 'scrcpy', width: Math.round(this.geometry.width * 2), height: Math.round(this.geometry.height * 2),
      fps: 30, bitrate: 4000000, port: 0,
    })).value
    if (!Number.isSafeInteger(capture?.id) || capture.id < 1) throw new Error('Invalid iOS capture identifier')
    this.captureId = capture.id
    if (capture.codec !== 'h264' || capture.framing !== 'scrcpy' || !Number.isInteger(capture.port) || capture.port < 1 || capture.port > 65535) throw new Error('Invalid iOS video endpoint')
    this.abort.signal.throwIfAborted()
    const socket = await connectIos(this.client.udid, capture.port, this.abort.signal)
    this.socket = socket
    if (this.closed) { socket.destroy(); throw new Error('iOS video closed') }
    const fail = () => { if (!this.closed && !this.failureReported) { this.failureReported = true; this.ready = false; clearTimeout(this.watchdog); this.failed() } }
    let configuration: NativeFrame | undefined
    const parser = new IosVideoParser(frame => {
      if (this.closed) return
      if (!this.ready) { if (frame.config) configuration = frame; return }
      clearTimeout(this.watchdog); this.watchdog = setTimeout(fail, 10000)
      this.frame({ ...frame, rotation: this.geometry.rotation })
    })
    socket.on('data', chunk => { try { parser.push(chunk) } catch { socket.destroy(); fail() } })
    socket.once('error', fail); socket.once('end', fail); socket.once('close', fail)
    socket.resume()
    if (status.state !== 'connected') {
      const broadcast = (await this.client.request('POST', this.path('/broadcast/start'), {
        timeout: 25, confirmButtonLabels: ['Start Broadcast', '开始直播', '开始广播'], restoreForegroundApp: true,
      }, undefined, 30000)).value
      if (broadcast?.state !== 'connected' || !Number.isFinite(broadcast.connectedAt)) throw new Error('ReplayKit broadcast did not start')
    }
    this.abort.signal.throwIfAborted()
    if (this.failureReported) throw new Error('iOS video disconnected during startup')
    this.ready = true
    if (configuration) this.frame({ ...configuration, rotation: this.geometry.rotation })
    this.watchdog = setTimeout(fail, 10000)
    await this.client.request('POST', this.path(`/${this.captureId}/keyframe`), {}, this.abort.signal)
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true; this.ready = false; this.abort.abort(); clearTimeout(this.watchdog); this.socket?.destroy()
    this.closing = (async () => {
      await this.starting?.catch(() => {})
      this.socket?.destroy()
      if (this.captureId !== undefined) {
        try {
          await this.client.request('POST', this.path(`/${this.captureId}/stop`), {}, undefined, 5000)
        } catch (error) {
          // A lost acknowledgement may follow a successful stop. Upstream
          // rejects repeated stop, but its read-only lookup returns null for an
          // absent ID. Unknown/unreachable state must keep cleanup retryable.
          const result = await this.client.request('GET', `/mobilerun/screencapture/${this.captureId}`, undefined, undefined, 5000).catch(() => undefined)
          if (!result || result.value !== null) throw error
        }
        this.captureId = undefined
      }
      // Broadcast belongs to iOS, not this capture. Upstream has no atomic
      // owner-checked stop: stopping it after a status check could kill a stream
      // attached by another client in between. Leave that action to the phone.

    })().catch(error => { this.closing = undefined; throw error })
    return this.closing
  }
}
