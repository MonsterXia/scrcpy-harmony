import type { DeviceDiscovery } from '../../common/types'
import { AutomationFault, checkContext, failure, parseRequest, publicSchema, success } from '../../common/automation/protocol'
import type { AutomationContext, AutomationRequest, AutomationResult } from '../../common/automation/protocol'
import { deviceCapabilities } from '../../common/automation/capabilities'

export interface ServiceOptions { instanceId: string; version: string; running?(key: string): boolean; discover(): Promise<DeviceDiscovery> }
export type OperationHandler = (params: Record<string, unknown>, context: AutomationContext) => Promise<unknown>
export function createAutomationService(options: ServiceOptions) {
  const handlers = new Map<string, OperationHandler>()
  const status = () => ({ instanceId: options.instanceId, version: options.version, apiVersion: 1, pid: process.pid })
  const discover = async () => {
    const result = await options.discover()
    return { devices: result.targets.map(target => ({ ...target, capabilities: deviceCapabilities(target, new Set(handlers.keys()), options.running?.(target.key)) })),
      errors: result.errors.map(platform => ({ platform, code: 'DISCOVERY_FAILED' })) }
  }
  handlers.set('service.status', async () => status())
  handlers.set('doctor', async () => ({ ...status(), ready: true }))
  handlers.set('schema', async () => publicSchema())
  handlers.set('devices.list', discover)
  handlers.set('devices.capabilities', async params => {
    const result = await discover()
    const device = result.devices.find(device => device.key === params.device)
    if (!device) throw new AutomationFault(result.errors.length ? 'UNAVAILABLE' : 'NOT_FOUND', 'Device not found; inspect devices list for discovery failures')
    return device
  })
  return {
    register(name: string, handler: OperationHandler) { handlers.set(name, handler) },
    async dispatch(value: AutomationRequest, context: AutomationContext): Promise<AutomationResult> {
      let requestId = 'invalid-request'
      try {
        const request = parseRequest(value); requestId = request.requestId
        checkContext(context)
        if (request.clientId !== context.clientId) throw new AutomationFault('UNAUTHORIZED', 'Client identity mismatch')
        const handler = handlers.get(request.operation)
        if (!handler) throw new AutomationFault('UNSUPPORTED', 'Operation is not implemented')
        const data = await handler(request.params, context)
        checkContext(context)
        return success(requestId, data)
      } catch (error) { return failure(requestId, error) }
    },
  }
}
