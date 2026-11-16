import { randomUUID } from 'node:crypto'
import { AutomationFault, checkContext, isRecord, MAX_IMAGE_BYTES } from '../../common/automation/protocol'
import type { AutomationContext } from '../../common/automation/protocol'
import type { FrameMetadata, FrameMethod, FrameState } from '../../common/automation/frames'
interface Contents { mainFrame: unknown; isDestroyed(): boolean; send(channel: string, value: unknown): void }
interface FrameEvent { sender: Contents; senderFrame: unknown }
interface Ipc { handle(channel: string, callback: (event: FrameEvent, ...args: any[]) => unknown): unknown }
interface Pending { owner: Contents; method: FrameMethod; finish(error?: Error, result?: FrameResult): void }
export interface FrameResult { metadata: FrameMetadata; png?: Uint8Array }
function metadata(value: unknown): FrameMetadata {
  if (!isRecord(value) || ![value.width,value.height].every(n => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 16384) || typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || typeof value.generation !== 'number' || !Number.isSafeInteger(value.generation) || value.generation < 1 || typeof value.capturedAt !== 'number' || !Number.isFinite(value.capturedAt) || value.capturedAt < 0 || ![0,90,180,270].includes(value.rotation as number)) throw new AutomationFault('INVALID_ARGUMENT', 'Invalid frame metadata')
  return { sequence: value.sequence, generation: value.generation, capturedAt: value.capturedAt, width: value.width as number, height: value.height as number, rotation: value.rotation as number }
}
export class AutomationFrameBridge {
  private owners = new Map<Contents, (state: FrameState) => void>()
  private pending = new Map<string, Pending>()
  constructor(ipc: Ipc) {
    ipc.handle('automationFrameResult', (event, requestId: unknown, result: unknown) => {
      this.owner(event)
      if (typeof requestId !== 'string') throw new AutomationFault('INVALID_ARGUMENT', 'Invalid frame request ID')
      const pending = this.pending.get(requestId)
      if (!pending) throw new AutomationFault('NOT_FOUND', 'Frame request expired')
      if (pending.owner !== event.sender) throw new AutomationFault('UNAUTHORIZED', 'Frame request belongs to another window')
      try {
        if (!isRecord(result) || result.ok !== true) throw new AutomationFault('UNAVAILABLE', 'Frame source is not ready')
        const meta = metadata(result.metadata)
        let png: Uint8Array | undefined
        if (pending.method === 'capture') {
          if (!(result.png instanceof Uint8Array) || result.png.byteLength > MAX_IMAGE_BYTES || result.png.byteLength < 24) throw new AutomationFault('INTERNAL', 'Invalid screenshot payload')
          const data = Buffer.from(result.png.buffer, result.png.byteOffset, result.png.byteLength)
          if (!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || data.toString('ascii',12,16) !== 'IHDR' || data.readUInt32BE(16) !== meta.width || data.readUInt32BE(20) !== meta.height) throw new AutomationFault('INTERNAL', 'Screenshot dimensions do not match frame metadata')
          png = result.png
        }
        pending.finish(undefined, { metadata: meta, ...(png ? { png } : {}) })
      } catch (error) { pending.finish(error instanceof Error ? error : new AutomationFault('INTERNAL', 'Frame response failed')) }
    })
    ipc.handle('automationFrameState', (event, value: unknown) => {
      const report = this.owner(event)
      if (!isRecord(value)) throw new AutomationFault('INVALID_ARGUMENT', 'Invalid frame state')
      if (value.state === 'presented') report({ state: 'presented', metadata: metadata(value.metadata) })
      else if (value.state === 'starting' || value.state === 'error' || value.state === 'disconnected') report({ state: value.state })
      else throw new AutomationFault('INVALID_ARGUMENT', 'Invalid frame state')
    })
  }
  private owner(event: FrameEvent) {
    const owner = this.owners.get(event.sender)
    if (!owner || event.sender.isDestroyed() || event.senderFrame !== event.sender.mainFrame) throw new AutomationFault('UNAUTHORIZED', 'Frame document is not registered')
    return owner
  }
  register(contents: Contents, report: (state: FrameState) => void) {
    if (this.owners.has(contents)) throw new AutomationFault('BUSY', 'Frame document already registered')
    this.owners.set(contents, report)
    return () => {
      this.owners.delete(contents)
      for (const pending of this.pending.values()) if (pending.owner === contents) pending.finish(new AutomationFault('UNAVAILABLE', 'Frame document closed'))
    }
  }
  request(contents: Contents, method: FrameMethod, context: AutomationContext): Promise<FrameResult> {
    try {
      checkContext(context)
      if (!this.owners.has(contents) || contents.isDestroyed()) throw new AutomationFault('UNAVAILABLE', 'Frame document is unavailable')
      if ([...this.pending.values()].some(pending => pending.owner === contents)) throw new AutomationFault('BUSY', 'A frame request is already in progress', 'not-started', true)
    } catch (error) { return Promise.reject(error) }
    const requestId = randomUUID()
    return new Promise((resolve,reject) => {
      let settled = false
      const finish = (error?: Error, result?: FrameResult) => {
        if (settled) return
        settled = true; clearTimeout(timer); context.signal.removeEventListener('abort', onAbort); this.pending.delete(requestId)
        if (error) reject(error); else resolve(result!)
      }
      const onAbort = () => finish(new AutomationFault('CANCELLED', 'Frame request cancelled'))
      const timer = setTimeout(() => finish(new AutomationFault('TIMEOUT', 'Frame request timed out')), Math.max(1,context.deadline-Date.now()))
      this.pending.set(requestId, { owner: contents, method, finish })
      context.signal.addEventListener('abort', onAbort, { once: true })
      if (context.signal.aborted) { onAbort(); return }
      try { contents.send('automationFrameRequest', { requestId, method }) }
      catch { finish(new AutomationFault('UNAVAILABLE', 'Could not reach frame document')) }
    })
  }
}
