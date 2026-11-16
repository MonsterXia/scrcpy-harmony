import type { AutomationController } from './controller'
import type { createAutomationService } from './service'
import type { SessionState } from './sessions'
import type { InputAction } from './input'
export function registerSessionOperations(service: ReturnType<typeof createAutomationService>, controller: AutomationController) {
  service.register('sessions.start',(p,c)=>controller.start(p.device as string,c))
  service.register('sessions.list',async()=>controller.sessions.list())
  service.register('sessions.get',async p=>controller.sessions.get(p.session as string))
  service.register('sessions.wait',(p,c)=>controller.sessions.wait(p.session as string,(p.state || 'running') as SessionState,c))
  service.register('sessions.leases',async(_p,c)=>controller.sessions.leases(c.clientId))
  service.register('sessions.release',(p,c)=>controller.sessions.releaseLease(p.lease as string,c))
  service.register('sessions.stop',(p,c)=>controller.sessions.release(p.session as string,p.lease as string,c))
  service.register('screen.capture',(p,c)=>controller.capture(p.session as string,{maxAgeMs:p.maxAgeMs as number|undefined,allowStale:p.allowStale as boolean|undefined,afterAction:p.afterAction as string|undefined},c))
  for (const type of ['tap','swipe','scroll','text','key'] as const) service.register(`input.${type}`,(p,c)=>{
    const {session,frame,...action}=p
    return controller.input(session as string,{...action,type} as InputAction,frame as string|undefined,c)
  })
}
