import { request as httpRequest } from 'node:http'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { AutomationFault, isRecord, MAX_REQUEST_BYTES, operations, parseRequest } from '../common/automation/protocol'
import type { AutomationRequest, AutomationResult, ErrorCode } from '../common/automation/protocol'
import { readDiscovery, readPrivateJson, secureDirectory } from '../main/automation/discovery'

export interface ClientOptions { profilePath: string; deadline: number; signal: AbortSignal }
export async function resolveClientId(profilePath: string, name: string) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new AutomationFault('INVALID_ARGUMENT', 'Client name must contain 1–64 letters, numbers, underscores or hyphens')
  const directory = path.join(profilePath, 'automation-clients')
  await secureDirectory(directory)
  const file = path.join(directory, `${name}.json`)
  const temporary = path.join(directory, `${randomUUID()}.tmp`)
  try {
    try { await fs.access(file) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await fs.writeFile(temporary, JSON.stringify({ clientId: `cli:${randomUUID()}` }), { flag: 'wx', mode: 0o600 })
      try { await fs.link(temporary, file) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    const data = await readPrivateJson(file)
    if (!isRecord(data) || typeof data.clientId !== 'string' || !/^cli:[a-f0-9-]{36}$/.test(data.clientId)) throw new AutomationFault('UNAVAILABLE', 'Invalid persisted client identity')
    return data.clientId
  } finally { await fs.unlink(temporary).catch(() => {}) }
}
function validateResult(value: unknown, requestId: string): AutomationResult {
  if (!isRecord(value) || value.apiVersion !== 1) throw new AutomationFault('VERSION_MISMATCH', 'Unsupported response protocol version')
  if (value.requestId !== requestId || typeof value.ok !== 'boolean') throw new AutomationFault('INTERNAL', 'Invalid service response identity')
  if (value.ok) {
    if (!Object.hasOwn(value, 'data') || Object.hasOwn(value, 'error')) throw new AutomationFault('INTERNAL', 'Invalid service success response')
  } else {
    const e = value.error
    const codes: ErrorCode[] = ['INVALID_ARGUMENT','VERSION_MISMATCH','UNSUPPORTED','NOT_FOUND','UNAVAILABLE','BUSY','UNAUTHORIZED','TIMEOUT','OUTCOME_UNKNOWN','INTERNAL','CANCELLED']
    if (Object.hasOwn(value, 'data') || !isRecord(e) || !codes.includes(e.code as ErrorCode) || typeof e.message !== 'string' || typeof e.retryable !== 'boolean' || !['not-started','completed','unknown'].includes(e.outcome as string)) throw new AutomationFault('INTERNAL', 'Invalid service error response')
  }
  return value as unknown as AutomationResult
}
export async function callAutomation(value: AutomationRequest, options: ClientOptions): Promise<AutomationResult> {
  const parsed = parseRequest(value)
  if (options.signal.aborted) throw new AutomationFault('CANCELLED', 'Operation cancelled')
  const discovery = await readDiscovery(options.profilePath)
  const remaining = Math.min(parsed.timeoutMs, options.deadline - Date.now())
  if (remaining < 1) throw new AutomationFault('TIMEOUT', 'Operation deadline exceeded')
  const body = Buffer.from(JSON.stringify({ ...parsed, timeoutMs: remaining }))
  if (body.length > MAX_REQUEST_BYTES) throw new AutomationFault('INVALID_ARGUMENT', 'Request exceeds 1 MiB')
  return new Promise((resolve, reject) => {
    let sent = false, settled = false
    const uncertain = () => sent && !operations[parsed.operation].readOnly
    const finish = (error?: unknown, result?: AutomationResult) => {
      if (settled) return
      settled = true; clearTimeout(timer); options.signal.removeEventListener('abort', onAbort)
      if (error) reject(error); else resolve(result!)
    }
    const req = httpRequest(discovery.endpoint + '/v1/call', { method: 'POST', headers: {
      'content-type': 'application/json', 'content-length': body.length,
      authorization: `Bearer ${discovery.token}`, 'x-scrcpy-instance': discovery.instanceId,
    } }, response => {
      if (response.statusCode === 403) { response.resume(); finish(new AutomationFault('UNAUTHORIZED', 'Local service authorization failed')); return }
      const chunks: Buffer[] = []; let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_REQUEST_BYTES) { finish(new AutomationFault('INTERNAL', 'Service response exceeds 1 MiB')); response.destroy(); req.destroy() }
        else chunks.push(chunk)
      })
      response.on('aborted', () => finish(new AutomationFault(uncertain() ? 'OUTCOME_UNKNOWN' : 'UNAVAILABLE', 'Service response interrupted', uncertain() ? 'unknown' : 'not-started')))
      response.on('error', () => finish(new AutomationFault('UNAVAILABLE', 'Service response stream failed', uncertain() ? 'unknown' : 'not-started')))
      response.on('end', () => {
        try { finish(undefined, validateResult(JSON.parse(Buffer.concat(chunks).toString('utf8')), parsed.requestId)) }
        catch (error) { finish(error instanceof AutomationFault ? error : new AutomationFault('INTERNAL', 'Malformed service response')) }
      })
    })
    const onAbort = () => { finish(new AutomationFault('CANCELLED', 'Operation cancelled', uncertain() ? 'unknown' : 'not-started')); req.destroy() }
    const timer = setTimeout(() => { finish(new AutomationFault('TIMEOUT', 'Operation deadline exceeded', uncertain() ? 'unknown' : 'not-started', !uncertain())); req.destroy() }, remaining)
    options.signal.addEventListener('abort', onAbort, { once: true })
    req.on('finish', () => { sent = true })
    req.on('error', () => finish(new AutomationFault(uncertain() ? 'OUTCOME_UNKNOWN' : 'UNAVAILABLE', 'Local service connection failed', uncertain() ? 'unknown' : 'not-started', !uncertain())))
    if (options.signal.aborted) onAbort(); else req.end(body)
  })
}
