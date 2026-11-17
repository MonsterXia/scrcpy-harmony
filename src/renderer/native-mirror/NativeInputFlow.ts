import type { NativeMirrorInput } from 'common/types'

// WDA gestures take longer than DOM wheel/pointer events. Keep at most one IPC
// in flight and coalesce observations before dispatch, never retry a write.
export class NativeInputFlow {
  private pending: NativeMirrorInput[] = []
  private running = false
  private gesture = false
  private ending = false
  private blocked = false
  private disposed = false
  private last = { x: 0, y: 0 }
  constructor(private invoke: (input: NativeMirrorInput) => Promise<void>, private failed: (error: unknown) => void) {}

  send(input: NativeMirrorInput): boolean {
    if (this.disposed || this.blocked) return false
    if (input.type === 'touch') {
      if (input.action === 'down') {
        if (this.gesture || this.running || this.pending.length) return false
        this.gesture = true
      } else if (!this.gesture || this.ending) return false
      this.last = { x: input.x, y: input.y }
      if (input.action === 'up' || input.action === 'cancel') this.ending = true
    } else if (this.gesture) return false
    const previous = this.pending.at(-1)
    if (input.type === 'scroll' && previous?.type === 'scroll') {
      this.pending[this.pending.length - 1] = { ...input,
        dx: Math.max(-1, Math.min(1, previous.dx + input.dx)), dy: Math.max(-1, Math.min(1, previous.dy + input.dy)) }
    } else if (input.type === 'touch' && input.action === 'move' && previous?.type === 'touch' && previous.action === 'move') {
      this.pending[this.pending.length - 1] = input
    } else {
      if (this.pending.length >= 32 && !(input.type === 'touch' && this.ending)) return false
      this.pending.push(input)
    }
    void this.drain()
    return true
  }
  private async drain() {
    if (this.running || !this.pending.length) return
    this.running = true
    const input = this.pending.shift()!
    try {
      await this.invoke(input)
      if (input.type === 'touch' && (input.action === 'up' || input.action === 'cancel')) { this.gesture = false; this.ending = false }
    } catch (error) {
      this.pending = []; this.blocked = true
      if (this.gesture) {
        // Cancel releases the GUI reservation and discards buffered iOS points;
        // it does not commit or resend a failed gesture.
        await this.invoke({ type: 'touch', action: 'cancel', ...this.last }).catch(() => {})
        this.gesture = false; this.ending = false
      }
      if (!this.disposed) this.failed(error)
    } finally { this.running = false; void this.drain() }
  }
  reset() {
    if (this.running || this.disposed) return
    this.pending = []; this.gesture = false; this.ending = false; this.blocked = false
  }
  dispose() {
    this.disposed = true; this.pending = []
    if (this.gesture) { this.pending.push({ type: 'touch', action: 'cancel', ...this.last }); void this.drain() }
  }
}
