import { AutomationFault } from '../../../common/automation/protocol'
import type { InputBackend } from '../input'
interface TouchLease {
  touch?: { x: number; y: number }
  driver: { touchDown(x: number,y: number): Promise<void>; touchMove(x: number,y: number): Promise<void>; touchUp(x: number,y: number): Promise<void> }
}
export function harmonyInput(lease: TouchLease, size: { width: number; height: number }, send: { text(text: string,signal: AbortSignal): Promise<void>; key(key: string,signal: AbortSignal): Promise<void>; size?(): Promise<{width:number;height:number}> }, expected?: {width:number;height:number}): InputBackend {
  if (![size.width,size.height].every(n => Number.isInteger(n) && n > 0 && n <= 16384)) throw new AutomationFault('UNAVAILABLE', 'Device display dimensions are unavailable')
  // Capture may be scaled, so compare aspect ratios with two source pixels
  // of rounding tolerance rather than requiring physical dimensions to match.
  if (expected && (Math.sign(size.width-size.height)!==Math.sign(expected.width-expected.height) || Math.abs(size.width*expected.height-size.height*expected.width)>2*Math.max(size.width,size.height))) throw new AutomationFault('UNAVAILABLE','Display geometry changed; capture a new frame')
  return {
    async touch(action,x,y,signal) {
      signal.throwIfAborted()
      if (action !== 'up' && expected && send.size) {
        const current=await send.size()
        signal.throwIfAborted()
        if (current.width!==size.width || current.height!==size.height) throw new AutomationFault('UNAVAILABLE','Display geometry changed; capture a new frame')
      }
      const point = { x: Math.min(size.width-1,Math.round(x*size.width)), y: Math.min(size.height-1,Math.round(y*size.height)) }
      if (action === 'down' || lease.touch) lease.touch = point
      await lease.driver[action === 'down' ? 'touchDown' : action === 'move' ? 'touchMove' : 'touchUp'](point.x,point.y)
      if (action === 'up') lease.touch = undefined
    },
    // Harmony has no wheel primitive in this driver. The runtime explicitly
    // translates scroll to a bounded swipe before calling executeInput.
    async scroll() { throw new AutomationFault('UNSUPPORTED', 'Use the Harmony scroll gesture adapter') },
    text: send.text, key: send.key,
  }
}
