import type { FrameMetadata, FrameMethod, FrameResponse, FrameState } from '../../common/automation/frames'
interface FramePort {
  on(channel: string, listener: (value: { requestId: string; method: FrameMethod }) => void): () => void
  automationFrameState(state: FrameState): Promise<unknown>
  automationFrameResult(requestId: string, result: FrameResponse): Promise<unknown>
}
// Only the video canvas is captured. Toolbar, window chrome and placeholders
// never enter the automation observation stream.
export class AutomationFrameSource {
  private generation = 1
  private sequence = 0
  private latest?: FrameMetadata
  private disposed = false
  private busy = false
  private unsubscribe: () => void
  constructor(private port: FramePort, private canvas: () => HTMLCanvasElement | null, private now = Date.now) {
    this.unsubscribe = port.on('automationFrameRequest', request => this.respond(request))
  }
  presented(rotation = 0) {
    const canvas = this.canvas()
    if (this.disposed || !canvas || !canvas.width || !canvas.height) return
    const previous = this.latest
    // Bitmap is already oriented. Device rotation also invalidates old input
    // references when an iPhone turns 180 degrees without changing dimensions.
    this.latest = { sequence: ++this.sequence, capturedAt: this.now(), width: canvas.width, height: canvas.height, rotation, generation: this.generation }
    if (!previous || previous.width !== canvas.width || previous.height !== canvas.height || previous.rotation !== rotation) this.report({ state: 'presented', metadata: this.latest })
  }
  reset(state: 'starting' | 'error' | 'disconnected' = 'starting') {
    this.generation++; this.latest = undefined
    this.report({ state })
  }
  private report(state: FrameState) { if (!this.disposed) void this.port.automationFrameState(state).catch(() => {}) }
  private async respond(request: { requestId: string; method: FrameMethod }) {
    if (this.disposed) return
    let result: FrameResponse = { ok: false, code: 'UNAVAILABLE' }
    const canvas = this.canvas(), meta = this.latest && { ...this.latest }
    if (!this.busy && canvas && meta && (request.method === 'metadata' || request.method === 'capture')) {
      this.busy = true
      try {
        result = { ok: true, metadata: meta }
        if (request.method === 'capture') {
          // toBlob snapshots the bitmap synchronously, before encoding it.
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Encoding failed')), 'image/png'))
          if (blob.size > 32 * 1024 * 1024) throw new Error('Image too large')
          result.png = new Uint8Array(await blob.arrayBuffer())
        }
        if (this.generation !== meta.generation) result = { ok: false, code: 'UNAVAILABLE' }
      } catch { result = { ok: false, code: 'INTERNAL' } }
      finally { this.busy = false }
    }
    if (!this.disposed) await this.port.automationFrameResult(request.requestId, result).catch(() => {})
  }
  dispose() {
    if (this.disposed) return
    this.reset('disconnected'); this.disposed = true; this.unsubscribe()
  }
}
