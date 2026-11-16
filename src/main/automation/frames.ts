import { randomUUID } from 'node:crypto'
import { AutomationFault } from '../../common/automation/protocol'
import type { FrameMetadata } from '../../common/automation/frames'
export type { FrameMetadata } from '../../common/automation/frames'
export interface ExportedFrame extends FrameMetadata { sessionId: string; frameId: string; displayRevision: number; stale: boolean; clock: 'host'; mimeType: 'image/png' }
export interface CaptureOptions { maxAgeMs?: number; allowStale?: boolean; afterAction?: string }
interface Geometry extends FrameMetadata { revision: number }
interface Reference { frame: ExportedFrame; issuedAt: number }
interface Barrier { sessionId: string; sequence: number; revision: number; issuedAt: number }
export class FrameLedger {
  private latest = new Map<string, Geometry>()
  private references = new Map<string, Reference[]>()
  private barriers = new Map<string, Barrier>()
  constructor(private now = Date.now) {}
  observe(sessionId: string, meta: FrameMetadata) {
    if (!Number.isSafeInteger(meta.sequence) || meta.sequence < 1) throw new AutomationFault('UNAVAILABLE', 'No presented frame')
    if (![meta.width, meta.height].every(value => Number.isInteger(value) && value > 0 && value <= 16384) || !Number.isSafeInteger(meta.generation) || meta.generation < 1 || ![0,90,180,270].includes(meta.rotation) || !Number.isFinite(meta.capturedAt) || meta.capturedAt < 0 || meta.capturedAt > this.now() + 1000) throw new AutomationFault('INVALID_ARGUMENT', 'Invalid frame metadata')
    const previous = this.latest.get(sessionId)
    if (previous && (meta.generation < previous.generation || (meta.generation === previous.generation && meta.sequence < previous.sequence))) throw new AutomationFault('UNAVAILABLE', 'Frame belongs to an obsolete presentation')
    const changed = previous && (previous.width !== meta.width || previous.height !== meta.height || previous.rotation !== meta.rotation || previous.generation !== meta.generation)
    const geometry = { ...meta, revision: previous ? previous.revision + (changed ? 1 : 0) : 1 }
    this.latest.set(sessionId, geometry)
    return geometry
  }
  issue(sessionId: string, meta: FrameMetadata, options: CaptureOptions = {}): ExportedFrame {
    const current = this.observe(sessionId, meta)
    const maxAge = options.maxAgeMs ?? 2000
    if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 600000) throw new AutomationFault('INVALID_ARGUMENT', 'Invalid frame maximum age')
    const stale = this.now() - meta.capturedAt > maxAge
    if (options.afterAction) {
      const barrier = this.barriers.get(options.afterAction)
      if (!barrier || barrier.sessionId !== sessionId || this.now() - barrier.issuedAt > 60000 || barrier.revision !== current.revision) throw new AutomationFault('INVALID_ARGUMENT', 'Observation token expired or display changed')
      if (meta.sequence <= barrier.sequence || stale) throw new AutomationFault('UNAVAILABLE', 'Waiting for a new frame after the action')
    } else if (stale && !options.allowStale) throw new AutomationFault('UNAVAILABLE', 'Waiting for a fresh frame')
    const frame: ExportedFrame = { ...meta, sessionId, frameId: randomUUID(), displayRevision: current.revision, stale, clock: 'host', mimeType: 'image/png' }
    const retained = (this.references.get(sessionId) || []).filter(item => this.now() - item.issuedAt <= 60000)
    retained.push({ frame, issuedAt: this.now() })
    this.references.set(sessionId, retained.slice(-16))
    return { ...frame }
  }
  geometry(sessionId: string, frameId: string) {
    const reference = this.references.get(sessionId)?.find(item => item.frame.frameId === frameId)
    const latest = this.latest.get(sessionId)
    if (!reference || this.now() - reference.issuedAt > 60000 || !latest || reference.frame.displayRevision !== latest.revision) throw new AutomationFault('INVALID_ARGUMENT', 'Frame reference expired or display changed; capture again')
    return { ...reference.frame }
  }
  barrier(sessionId: string, meta: FrameMetadata) {
    const current = this.observe(sessionId, meta)
    for (const [token, barrier] of this.barriers) if (this.now() - barrier.issuedAt > 60000) this.barriers.delete(token)
    const own = [...this.barriers].filter(([, barrier]) => barrier.sessionId === sessionId)
    while (own.length >= 64) this.barriers.delete(own.shift()![0])
    const token = randomUUID()
    this.barriers.set(token, { sessionId, sequence: meta.sequence, revision: current.revision, issuedAt: this.now() })
    return token
  }
  invalidate(sessionId: string) {
    this.latest.delete(sessionId); this.references.delete(sessionId)
    for (const [token, barrier] of this.barriers) if (barrier.sessionId === sessionId) this.barriers.delete(token)
  }
}
