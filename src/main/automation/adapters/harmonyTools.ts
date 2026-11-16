import type { DeviceDiscovery } from '../../../common/types'
import { AutomationFault, checkContext } from '../../../common/automation/protocol'
import type { AutomationContext } from '../../../common/automation/protocol'
import type { DeviceOperationContext } from '../../../common/automation/deviceContext'
import type { OperationHandler } from '../service'
interface Dependencies {
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
  function read(operation: (p: Record<string,unknown>,c: DeviceOperationContext) => Promise<unknown>, mutates = false): OperationHandler {
    return async (params,context) => {
      checkContext(context)
      const discovery = await deps.discover()
      checkContext(context)
      const device = discovery.targets.find(item => item.key === params.device)
      if (!device) throw new AutomationFault(discovery.errors.length ? 'UNAVAILABLE' : 'NOT_FOUND', 'Device is not available')
      if (device.platform !== 'harmony') throw new AutomationFault('UNSUPPORTED', 'This tool requires a Harmony device')
      if (device.state !== 'ready') throw new AutomationFault('UNAVAILABLE', 'Device is offline or requires authorization')
      let sent = false
      const scoped: DeviceOperationContext = { ...context, deviceKey: device.key, shell: async command => {
        checkContext(context)
        sent = true
        const output = await deps.shell(device.key,command,context)
        checkContext(context)
        if (/^\s*(?:\[Fail\]|\[E\d{6}\]|error:)/im.test(output)) throw new AutomationFault('UNAVAILABLE', 'Device command returned an error')
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
  return handlers

}
