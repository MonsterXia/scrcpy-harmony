import { randomUUID } from 'node:crypto'
import { waitForRead } from './waitForRead'
import { runOneShotShell } from './oneShotShell'
import type { DeviceDiscovery } from '../../../common/types'
import { AutomationFault, checkContext } from '../../../common/automation/protocol'
import type { AutomationContext } from '../../../common/automation/protocol'
import type { DeviceOperationContext } from '../../../common/automation/deviceContext'
import type { OperationHandler } from '../service'
interface Dependencies {
  layout?(key: string,context: DeviceOperationContext): Promise<string>
  logs?(key: string,durationMs: number,maxBytes: number,context: DeviceOperationContext): Promise<{bytes: Uint8Array;truncated: boolean;durationMs: number}>
  captureHost?(key: string,args: string[],context: AutomationContext,durationMs: number,maxBytes: number): Promise<{bytes: Uint8Array;truncated: boolean;durationMs: number}>
  ports?: { list(key:string,reverse:boolean,context:DeviceOperationContext):Promise<unknown>; add(key:string,local:string,remote:string,reverse:boolean,context:DeviceOperationContext):Promise<unknown>; remove(key:string,local:string,remote:string,reverse:boolean,context:DeviceOperationContext):Promise<unknown> }
  discover(): Promise<DeviceDiscovery>
  host?(key: string,args: string[],context: AutomationContext): Promise<string>
  writeApp?(action: string,key: string,params: Record<string,unknown>,context: DeviceOperationContext): Promise<unknown>
  shell(key: string,command: string,context: AutomationContext): Promise<string>
  overview(key: string,context: DeviceOperationContext): Promise<unknown>
  appsList(key: string,system: boolean,context: DeviceOperationContext): Promise<unknown>
  appsInfo(key: string,bundles: string[],context: DeviceOperationContext): Promise<unknown[]>
  appsTop(key: string,context: DeviceOperationContext): Promise<unknown>
  processes(key: string,context: DeviceOperationContext): Promise<unknown>
}
export function validateBundleName(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.]{0,254}$/.test(value)) throw new AutomationFault('INVALID_ARGUMENT', 'Invalid application bundle name')
}
export function createHarmonyToolHandlers(deps: Dependencies): Record<string,OperationHandler> {
  function read(operation: (p: Record<string,unknown>,c: DeviceOperationContext) => Promise<unknown>, mutates = false, rawOutput = false): OperationHandler {
    return async (params,context) => {
      checkContext(context)
      const discovery = await deps.discover()
      checkContext(context)
      const device = discovery.targets.find(item => item.key === params.device)
      if (!device) throw new AutomationFault(discovery.errors.length ? 'UNAVAILABLE' : 'NOT_FOUND', 'Device is not available')
      if (device.platform !== 'harmony') throw new AutomationFault('UNSUPPORTED', 'This tool requires a Harmony device')
      if (device.state !== 'ready') throw new AutomationFault('UNAVAILABLE', 'Device is offline or requires authorization')
      let sent = false
      const scoped: DeviceOperationContext = { ...context, deviceKey: device.key, wait: operation => waitForRead(context,operation), captureHost: async(args,duration,maxBytes) => {
        checkContext(context)
        if (!deps.captureHost) throw new AutomationFault('UNSUPPORTED','Log capture unavailable')
        return deps.captureHost(device.key,args,context,duration,maxBytes)
      }, shell: async command => {
        checkContext(context)
        sent = true
        const output = await deps.shell(device.key,command,context)
        checkContext(context)
        if (!rawOutput && /^\s*(?:\[Fail\]|\[E\d{6}\]|error:)/im.test(output)) throw new AutomationFault('UNAVAILABLE', 'Device command returned an error')
        return output
      }, host: async args => {
        checkContext(context)
        if (!deps.host) throw new AutomationFault('UNSUPPORTED', 'Host operation unavailable')
        sent = true
        const output = await deps.host(device.key,args,context)
        checkContext(context)
        return output
      } }
      try {
        const result = await operation(params,scoped)
        checkContext(context)
        return result
      } catch (error) {
        let fault = error
        try { checkContext(context) } catch (cancelled) { fault = cancelled }
        if (fault instanceof AutomationFault) {
          if (mutates && sent) throw new AutomationFault(fault.code,fault.message,'unknown',false)
          throw fault
        }
        if ((fault as { code?: string })?.code === 'HDC_COMMAND_TIMEOUT') throw new AutomationFault('TIMEOUT', 'Device query timed out', mutates && sent ? 'unknown' : 'not-started', !mutates)
        throw new AutomationFault(mutates && sent ? 'OUTCOME_UNKNOWN' : 'UNAVAILABLE', 'Device operation failed', mutates && sent ? 'unknown' : 'not-started')
      }
    }
  }
  const handlers: Record<string,OperationHandler> = {
    'overview.get': read((_p,c)=>deps.overview(c.deviceKey,c)),
    'apps.list': read((p,c)=>deps.appsList(c.deviceKey,p.userOnly !== true,c)),
    'apps.info': read(async(p,c)=>{validateBundleName(p.bundle);const info=await deps.appsInfo(c.deviceKey,[p.bundle],c);if(!info.length)throw new AutomationFault('UNAVAILABLE','Application metadata is unavailable');return info[0]}),
    'apps.top': read((_p,c)=>deps.appsTop(c.deviceKey,c)),
    'processes.list': read((_p,c)=>deps.processes(c.deviceKey,c)),
  }
  if (deps.writeApp) for (const action of ['start','stop','install','uninstall','clear-data','clear-cache']) {
    handlers[`apps.${action}`] = read(async(p,c) => {
      if (action !== 'install') validateBundleName(p.bundle)
      if (action === 'start' && (typeof p.ability !== 'string' || !/^[a-zA-Z_$][a-zA-Z0-9_.$]{0,254}$/.test(p.ability))) throw new AutomationFault('INVALID_ARGUMENT','Invalid ability name')
      await deps.writeApp!(action,c.deviceKey,p,c)
      return { completed: true }
    }, true)
  }
  handlers['shell.run'] = read((p,c)=>runOneShotShell(p.command as string,(p.maxBytes ?? 131072) as number,c,command=>c.shell(command)),true,true)
  if (deps.ports) for (const action of ['list','add','remove'] as const) handlers[`ports.${action}`] = read(async(p,c)=>{
    if (p.direction !== 'forward' && p.direction !== 'reverse') throw new AutomationFault('INVALID_ARGUMENT','Choose forward or reverse')
    const reverse=p.direction==='reverse'
    if (action==='list') return deps.ports!.list(c.deviceKey,reverse,c)
    validatePortNode(p.local,false);validatePortNode(p.remote,true)
    await deps.ports![action](c.deviceKey,p.local,p.remote,reverse,c)
    return {completed:true}
  },action!=='list')
  if (deps.layout) handlers['layout.dump'] = read(async(_p,c)=>{
    const bytes=Buffer.from(await deps.layout!(c.deviceKey,c),'utf8')
    if (bytes.length>1048576) throw new AutomationFault('UNAVAILABLE','Layout exceeds 1 MiB')
    return {artifact:{artifactId:randomUUID(),mimeType:'application/xml',byteLength:bytes.length},bytes}
  })
  if (deps.logs) handlers['logs.capture'] = read(async(p,c)=>{
    const result=await deps.logs!(c.deviceKey,(p.durationMs ?? 5000) as number,(p.maxBytes ?? 1048576) as number,c)
    if (result.bytes.byteLength>1048576) throw new AutomationFault('UNAVAILABLE','Log capture exceeds 1 MiB')
    return {artifact:{artifactId:randomUUID(),mimeType:'text/plain',byteLength:result.bytes.byteLength,truncated:result.truncated,durationMs:result.durationMs},bytes:result.bytes}
  })
  return handlers

}

export function validatePortNode(value: unknown,remote: boolean): asserts value is string {
  if (typeof value !== 'string' || value.length>256) throw new AutomationFault('INVALID_ARGUMENT','Invalid port node')
  if (/^tcp:[0-9]+$/.test(value) && Number(value.slice(4))>=1 && Number(value.slice(4))<=65535) return
  if (/^(localabstract|localreserved|localfilesystem|dev):[a-zA-Z0-9_./:@-]+$/.test(value)) return
  if (remote && /^jdwp:[1-9][0-9]{0,9}$/.test(value)) return
  throw new AutomationFault('INVALID_ARGUMENT','Invalid port node')
}
