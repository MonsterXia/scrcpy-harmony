import type { AutomationResult } from '../common/automation/protocol'
export function formatResult(result: AutomationResult, json: boolean) {
  if (json) return JSON.stringify(result) + '\n'
  if (!result.ok) return `${result.error.code}: ${result.error.message}\n`
  return JSON.stringify(result.data, null, 2) + '\n'
}
