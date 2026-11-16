import { setTimeout as delay } from 'node:timers/promises'
import { AutomationFault, checkContext } from '../../common/automation/protocol'
import type { AutomationContext } from '../../common/automation/protocol'

export type InputAction =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x: number; y: number; toX: number; toY: number; durationMs: number }
  | { type: 'scroll'; x: number; y: number; dx: number; dy: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: string }
export interface InputBackend {
  touch(action: 'down' | 'move' | 'up', x: number, y: number, signal: AbortSignal): Promise<void>
  scroll(x: number, y: number, dx: number, dy: number, signal: AbortSignal): Promise<void>
  text(text: string, signal: AbortSignal): Promise<void>
  key(key: string, signal: AbortSignal): Promise<void>
}
export class UnsafeInputFault extends AutomationFault {
  readonly unsafeInput = true
  constructor() { super('OUTCOME_UNKNOWN', 'Input release could not be confirmed; reopen the session before sending more input', 'unknown') }
}
function inputFailure(error: unknown) {
  if (error instanceof UnsafeInputFault) return error
  if (error instanceof AutomationFault) return new AutomationFault(error.code,error.message,'unknown',false)
  return new AutomationFault('OUTCOME_UNKNOWN','Input acknowledgement failed','unknown')
}
// A backend may ignore cancellation. Bound the caller while quarantining an
// unconfirmed write; a late press must never authorize another gesture.
async function writeInput(operation: () => Promise<void>, context: AutomationContext) {
  checkContext(context)
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancelled: (() => void) | undefined
  try {
    await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
      cancelled = () => reject(new UnsafeInputFault())
      timer = setTimeout(cancelled, Math.max(1, context.deadline - Date.now()))
      context.signal.addEventListener('abort', cancelled, { once: true })
      if (context.signal.aborted) cancelled()
    })])
    checkContext(context)
  } catch (error) { throw inputFailure(error) } finally {
    clearTimeout(timer)
    if (cancelled) context.signal.removeEventListener('abort', cancelled)
  }
}
export async function executeInput(action: InputAction, geometry: { width: number; height: number } | undefined, backend: InputBackend, context: AutomationContext) {
  checkContext(context)
  const invalid = () => { throw new AutomationFault('INVALID_ARGUMENT', 'Invalid input action') }
  const point = (x: number, y: number) => {
    if (!geometry || ![geometry.width, geometry.height].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= geometry.width || y >= geometry.height) return invalid()
    return { x: x / geometry.width, y: y / geometry.height }
  }
  if (!action || typeof action !== 'object') return invalid()
  if (action.type === 'text') {
    if (typeof action.text !== 'string' || action.text.length > 16384 || action.text.includes('\0')) return invalid()
    await writeInput(() => backend.text(action.text, context.signal), context); return
  }
  if (action.type === 'key') {
    if (!['home','back','enter','backspace','tab','up','down','left','right','power','volume-up','volume-down'].includes(action.key)) return invalid()
    try { await writeInput(() => backend.key(action.key, context.signal), context) }
    catch { throw new UnsafeInputFault() }
    return
  }
  if (!['tap','swipe','scroll'].includes(action.type)) return invalid()
  const start = point(action.x, action.y)
  if (action.type === 'scroll') {
    if (![action.dx, action.dy].every(n => Number.isFinite(n) && Math.abs(n) <= 1)) return invalid()
    await writeInput(() => backend.scroll(start.x, start.y, action.dx, action.dy, context.signal), context); return
  }
  const end = action.type === 'swipe' ? point(action.toX, action.toY) : start
  if (action.type === 'swipe' && (!Number.isInteger(action.durationMs) || action.durationMs < 1 || action.durationMs > 10000)) return invalid()
  let last = start
  let operationError: unknown, failed = false
  try {
    // A rejected press can still have reached the device; always try to release it.
    await writeInput(() => backend.touch('down', start.x, start.y, context.signal), context)
    checkContext(context)
    if (action.type === 'swipe') {
      const steps = Math.max(1, Math.ceil(action.durationMs / 16))
      for (let step = 1; step <= steps; step++) {
        try { await delay(action.durationMs / steps, undefined, { signal: context.signal }) }
        catch { checkContext(context); throw new AutomationFault('CANCELLED', 'Gesture cancelled', 'unknown') }
        checkContext(context)
        last = { x: start.x + (end.x - start.x) * step / steps, y: start.y + (end.y - start.y) * step / steps }
        await writeInput(() => backend.touch('move', last.x, last.y, context.signal), context)
      }
    }
  } catch (error) { operationError = error; failed = true }
  // Release failure takes priority over the original operation error because it
  // changes whether subsequent input is safe. Never throw from a finally block.
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const expired = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new UnsafeInputFault()) }, 5000) })
    await Promise.race([backend.touch('up', last.x, last.y, controller.signal), expired])
  } catch { throw new UnsafeInputFault() }
  finally { clearTimeout(timer) }
  if (failed) throw inputFailure(operationError)
  try { checkContext(context) } catch(error) { throw inputFailure(error) }
}
interface InputSlot { tail: Promise<unknown>; pending: number; automatic: number; guiTouch: boolean; unsafe: boolean; abort: AbortController }
export class DeviceInputQueue {
  private slots = new Map<string, InputSlot>()
  private slot(key: string) {
    let slot = this.slots.get(key)
    if (!slot) { slot = { tail: Promise.resolve(), pending: 0, automatic: 0, guiTouch: false, unsafe: false, abort: new AbortController() }; this.slots.set(key, slot) }
    return slot
  }
  private enqueue<T>(key: string, slot: InputSlot, operation: () => Promise<T>, release = false): Promise<T> {
    if (slot.unsafe && !release) return Promise.reject(new AutomationFault('UNAVAILABLE', 'Input state is uncertain; reopen the session'))
    if (slot.pending >= 64 && !release) return Promise.reject(new AutomationFault('BUSY', 'Device input queue is full'))
    slot.pending++
    const work = slot.tail.then(async () => {
      if (this.slots.get(key) !== slot || slot.abort.signal.aborted || (slot.unsafe && !release)) throw new AutomationFault('UNAVAILABLE', 'Input session is no longer active')
      return operation()
    }).catch(error => { if (error instanceof UnsafeInputFault) slot.unsafe = true; throw error })
      .finally(() => { slot.pending-- })
    slot.tail = work.catch(() => {})
    return work
  }
  automatic<T>(key: string, context: AutomationContext, operation: (context: AutomationContext) => Promise<T>) {
    const slot = this.slot(key)
    if (slot.guiTouch) return Promise.reject(new AutomationFault('BUSY', 'A GUI gesture is in progress'))
    slot.automatic++
    const combined = { ...context, signal: AbortSignal.any([context.signal, slot.abort.signal]) }
    return this.enqueue(key, slot, async () => { checkContext(combined); return operation(combined) })
      .finally(() => { slot.automatic-- })
  }
  gui<T>(key: string, phase: 'down' | 'move' | 'up' | undefined, operation: () => Promise<T>) {
    const slot = this.slot(key)
    if (slot.automatic) return Promise.reject(new AutomationFault('BUSY', 'Automation is operating this device'))
    if (phase === 'down' && slot.guiTouch) return Promise.reject(new AutomationFault('BUSY', 'A GUI gesture is already in progress'))
    if (slot.unsafe && phase !== 'up') return Promise.reject(new AutomationFault('UNAVAILABLE', 'Input state is uncertain; reopen the session'))
    if (slot.pending >= 64 && phase !== 'up') return Promise.reject(new AutomationFault('BUSY', 'Device input queue is full'))
    if (phase === 'down') slot.guiTouch = true
    return this.enqueue(key, slot, async () => {
      try {
        const result = await operation()
        if (phase === 'up') slot.guiTouch = false
        return result
      } catch (error) {
        if (phase) { slot.unsafe = true; throw new UnsafeInputFault() }
        throw error
      }
    }, phase === 'up')
  }
  discard(key: string) {
    const slot = this.slots.get(key)
    slot?.abort.abort(new AutomationFault('CANCELLED', 'Session discarded', 'unknown'))
    if (slot) {
      const replacement: InputSlot = { tail: slot.tail, pending: 0, automatic: 0, guiTouch: false, unsafe: false, abort: new AbortController() }
      this.slots.set(key, replacement)
      void replacement.tail.finally(() => { if (this.slots.get(key) === replacement && !replacement.pending) this.slots.delete(key) })
    }
  }
}
