import type { DeviceDiscovery } from '../../../common/types'
import { AutomationFault, checkContext } from '../../../common/automation/protocol'
import type { AutomationContext } from '../../../common/automation/protocol'
import type { DeviceOperationContext } from '../../../common/automation/deviceContext'
import type { OperationHandler } from '../service'
interface Dependencies {
  discover(): Promise<DeviceDiscovery>
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
  function read(operation: (p: Record<string,unknown>,c: DeviceOperationContext) => Promise<unknown>): OperationHandler {
    return async (params,context) => {
      checkContext(context)
      const discovery = await deps.discover()
      checkContext(context)
      const device = discovery.targets.find(item => item.key === params.device)
      if (!device) throw new AutomationFault(discovery.errors.length ? 'UNAVAILABLE' : 'NOT_FOUND', 'Device is not available')
      if (device.platform !== 'harmony') throw new AutomationFault('UNSUPPORTED', 'This tool requires a Harmony device')
      if (device.state !== 'ready') throw new AutomationFault('UNAVAILABLE', 'Device is offline or requires authorization')
      const scoped: DeviceOperationContext = { ...context, deviceKey: device.key, shell: async command => {
        checkContext(context)
        const output = await deps.shell(device.key,command,context)
        checkContext(context)
        if (/^\s*(?:\[Fail\]|\[E\d{6}\]|error:)/im.test(output)) throw new AutomationFault('UNAVAILABLE', 'Device command returned an error')
        return output
      } }
      try {
        const result = await operation(params,scoped)
        checkContext(context)
        return result
      } catch (error) {
        checkContext(context)
        if (error instanceof AutomationFault) throw error
        if ((error as { code?: string })?.code === 'HDC_COMMAND_TIMEOUT') throw new AutomationFault('TIMEOUT', 'Device query timed out', 'not-started', true)
        throw new AutomationFault('UNAVAILABLE', 'Device query failed')
      }
    }
  }
  return {
    'overview.get': read((_p,c)=>deps.overview(c.deviceKey,c)),
    'apps.list': read((p,c)=>deps.appsList(c.deviceKey,p.userOnly !== true,c)),
    'apps.info': read(async(p,c)=>{validateBundleName(p.bundle);const info=await deps.appsInfo(c.deviceKey,[p.bundle],c);if(!info.length)throw new AutomationFault('UNAVAILABLE','Application metadata is unavailable');return info[0]}),
    'apps.top': read((_p,c)=>deps.appsTop(c.deviceKey,c)),
    'processes.list': read((_p,c)=>deps.processes(c.deviceKey,c)),
  }
}
