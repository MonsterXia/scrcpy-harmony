import type { ITarget } from '../types'
export interface Capability { supported: boolean; available: boolean; reason?: string }
const platformOperations: Record<string, readonly string[]> = {
  'sessions.start': ['android', 'harmony', 'ios'],
  'screen.capture': ['android', 'harmony', 'ios'],
  'input.tap': ['android', 'harmony'], 'input.swipe': ['android', 'harmony'],
  'input.scroll': ['android', 'harmony'], 'input.text': ['android', 'harmony'], 'input.key': ['android', 'harmony'],
  'apps.start': ['harmony'], 'apps.stop': ['harmony'], 'apps.install': ['harmony'], 'apps.uninstall': ['harmony'], 'apps.clear-data': ['harmony'], 'apps.clear-cache': ['harmony'],
  'overview.get': ['harmony'], 'apps.list': ['harmony'], 'apps.info': ['harmony'], 'apps.top': ['harmony'], 'processes.list': ['harmony'], 'layout.dump': ['harmony'], 'shell.run': ['harmony'],
}
export function deviceCapabilities(target: Pick<ITarget, 'key' | 'platform' | 'state'>, enabled: ReadonlySet<string>, running = false): Record<string, Capability> {
  return Object.fromEntries(Object.entries(platformOperations).map(([operation, platforms]) => {
    if (!target.platform || !platforms.includes(target.platform)) return [operation, { supported: false, available: false, reason: 'platform-unsupported' }]
    if (!enabled.has(operation)) return [operation, { supported: false, available: false, reason: 'not-implemented' }]
    if (target.state !== 'ready' && !(operation === 'sessions.start' && target.key === 'ios:airplay-receiver') && !running) return [operation, { supported: true, available: false, reason: target.state || 'unavailable' }]
    if ((operation.startsWith('input.') || operation === 'screen.capture') && !running) return [operation, { supported: true, available: false, reason: 'session-required' }]
    return [operation, { supported: true, available: true }]
  }))
}
