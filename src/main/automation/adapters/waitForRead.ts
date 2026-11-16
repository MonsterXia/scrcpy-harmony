import { AutomationFault, checkContext } from '../../../common/automation/protocol'
import type { AutomationContext } from '../../../common/automation/protocol'
// SDK reads may finish late; no following phase is dispatched after cancellation.
export async function waitForRead<T>(context: AutomationContext, operation: () => Promise<T>): Promise<T> {
  checkContext(context)
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel: (() => void) | undefined
  try {
    const cancelled = new Promise<never>((_resolve,reject) => {
      cancel = () => reject(new AutomationFault('CANCELLED','Device read cancelled'))
      context.signal.addEventListener('abort',cancel,{once:true})
      timer = setTimeout(()=>reject(new AutomationFault('TIMEOUT','Device read timed out')),Math.max(1,context.deadline-Date.now()))
      if (context.signal.aborted) cancel()
    })
    checkContext(context)
    const result = await Promise.race([Promise.resolve().then(() => { checkContext(context); return operation() }),cancelled])
    checkContext(context)
    return result
  } finally {
    clearTimeout(timer)
    if (cancel) context.signal.removeEventListener('abort',cancel)
  }
}
