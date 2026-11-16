import type { NativeMirrorInput } from '../../../common/types'
import type { InputBackend } from '../input'
const keys: Record<string, number> = { home: 3, back: 4, enter: 66, backspace: 67, tab: 61, up: 19, down: 20, left: 21, right: 22, power: 26, 'volume-up': 24, 'volume-down': 25 }
export function androidInput(send: (input: NativeMirrorInput) => Promise<void>): InputBackend {
  const dispatch = (input: NativeMirrorInput, signal: AbortSignal) => { signal.throwIfAborted(); return send(input) }
  return {
    touch: (action,x,y,signal) => dispatch({ type: 'touch', action,x,y }, signal),
    scroll: (x,y,dx,dy,signal) => dispatch({ type: 'scroll', x,y,dx,dy }, signal),
    text: (text,signal) => dispatch({ type: 'text', text }, signal),
    key: (key,signal) => dispatch({ type: 'key', keyCode: keys[key] }, signal),
  }
}
