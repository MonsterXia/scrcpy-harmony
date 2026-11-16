import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { AutomationFault } from '../common/automation/protocol'
import { callAutomation } from './client'
import type { ClientOptions } from './client'
export async function startService(executable: string | undefined, args: string[], clientId: string, options: ClientOptions) {
  const probe = () => callAutomation({ apiVersion: 1, requestId: randomUUID(), clientId, operation: 'service.status', params: {}, timeoutMs: Math.max(1, Math.min(1000, options.deadline - Date.now())) }, options)
  try { const existing = await probe(); if (existing.ok) return existing; throw new AutomationFault(existing.error.code, existing.error.message) }
  catch (error) { if (!(error instanceof AutomationFault) || !['UNAVAILABLE','TIMEOUT'].includes(error.code)) throw error }
  if (!executable || !isAbsolute(executable)) throw new AutomationFault('INVALID_ARGUMENT', 'service start requires --app with an absolute executable path')
  try { await access(executable) } catch { throw new AutomationFault('NOT_FOUND', 'Application executable not found') }
  if (options.signal.aborted) throw new AutomationFault('CANCELLED', 'Service startup cancelled')
  const env: NodeJS.ProcessEnv = { ...process.env, SCRCPY_PLUS_PROFILE: options.profilePath }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(executable, args, { env, detached: true, stdio: 'ignore', windowsHide: true })
  let failed = false
  child.on('error', () => { failed = true })
  child.on('exit', code => { if (code !== 0 && code !== null) failed = true })
  child.unref()
  try {
    while (Date.now() < options.deadline) {
      if (options.signal.aborted) throw new AutomationFault('CANCELLED', 'Service startup cancelled')
      if (failed) throw new AutomationFault('UNAVAILABLE', 'Application exited before automation became ready')
      try { const result = await probe(); if (result.ok) return result; throw new AutomationFault(result.error.code, result.error.message) }
      catch (error) { if (!(error instanceof AutomationFault) || !['UNAVAILABLE','TIMEOUT'].includes(error.code)) throw error }
      await delay(Math.min(100, Math.max(1, options.deadline - Date.now())), undefined, { signal: options.signal }).catch(() => { throw new AutomationFault('CANCELLED', 'Service startup cancelled') })
    }
    throw new AutomationFault('TIMEOUT', 'Application did not expose automation before the deadline', 'unknown')
  } catch (error) {
    // Only terminate the process created by this invocation, never a discovered app.
    child.kill('SIGTERM')
    throw error
  }
}
