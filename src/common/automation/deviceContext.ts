import type { AutomationContext } from './protocol'
// Explicit request context for shared legacy GUI/device business functions.
// The service supplies a bounded shell bound to exactly this device identity.
export interface DeviceOperationContext extends AutomationContext {
  deviceKey: string
  shell(command: string): Promise<string>
  host?(args: string[]): Promise<string>
}
