export interface NativeFrame {
  data: Uint8Array
  timestamp: number
  config?: boolean
  keyFrame?: boolean
  reset?: boolean
}
export function h264Units(data: Uint8Array) {
  const result: Array<{ type: number; data: Uint8Array }> = []
  let start = -1, body = -1
  for (let i = 0; i + 3 < data.length; i++) {
    if (data[i] || data[i + 1]) continue
    const n = data[i + 2] === 1 ? 3 : data[i + 2] === 0 && data[i + 3] === 1 ? 4 : 0
    if (!n) continue
    if (start >= 0) result.push({ type: data[body] & 31, data: new Uint8Array(data.subarray(start, i)) })
    start = i; body = i + n; i += n - 1
  }
  if (start >= 0) result.push({ type: data[body] & 31, data: new Uint8Array(data.subarray(start)) })
  return result
}
// At most two unacknowledged frames per window. After loss, wait for a keyframe
// and prepend the last configuration, rather than decoding an incomplete GOP.
export class FrameGate {
  private pending = new Set<number>()
  private sequence = 0
  private config?: Uint8Array
  private sps?: Uint8Array
  private pps?: Uint8Array
  private waitingForKey = true
  push(frame: NativeFrame) {
    if (frame.data.byteLength > 8 * 1024 * 1024) return undefined
    const units = h264Units(frame.data)
    for (const unit of units) {
      if (unit.type !== 7 && unit.type !== 8) continue
      const previous = unit.type === 7 ? this.sps : this.pps
      if (!previous || previous.length !== unit.data.length || !previous.every((byte, index) => byte === unit.data[index])) this.waitingForKey = true
      if (unit.type === 7) this.sps = unit.data
      else this.pps = unit.data
    }
    if (this.sps && this.pps) {
      this.config = new Uint8Array(this.sps.length + this.pps.length)
      this.config.set(this.sps); this.config.set(this.pps, this.sps.length)
    }
    if (frame.config) return undefined
    if (frame.reset) this.waitingForKey = true
    const keyFrame = frame.keyFrame || units.some(unit => unit.type === 5)
    if (this.pending.size >= 2) { this.waitingForKey = true; return undefined }
    if (this.waitingForKey && (!keyFrame || !this.config)) return undefined
    const reset = this.waitingForKey
    this.waitingForKey = false
    const sequence = ++this.sequence; this.pending.add(sequence)
    return { ...frame, keyFrame, sequence, configuration: reset ? this.config : undefined, reset }
  }
  ack(sequence: number) { this.pending.delete(sequence) }
  reset() { this.pending.clear(); this.waitingForKey = true }
}
