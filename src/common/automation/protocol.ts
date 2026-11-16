// Machine-facing tool descriptions are protocol data, independent of GUI locale.
import descriptions from './descriptions.json'
export const API_VERSION = 1 as const
export const MAX_REQUEST_BYTES = 1024 * 1024
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024
export type ErrorCode = 'INVALID_ARGUMENT' | 'VERSION_MISMATCH' | 'UNSUPPORTED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'BUSY' | 'UNAUTHORIZED' | 'TIMEOUT' | 'OUTCOME_UNKNOWN' | 'INTERNAL' | 'CANCELLED'
export type Outcome = 'not-started' | 'completed' | 'unknown'
export interface AutomationError { code: ErrorCode; message: string; retryable: boolean; outcome: Outcome }
export type AutomationResult<T = unknown> =
  | { apiVersion: 1; requestId: string; ok: true; data: T }
  | { apiVersion: 1; requestId: string; ok: false; error: AutomationError }
export interface AutomationContext { clientId: string; deadline: number; signal: AbortSignal }
export class AutomationFault extends Error {
  constructor(public code: ErrorCode, message: string, public outcome: Outcome = 'not-started', public retryable = false) { super(message) }
}
export interface ParameterSchema {
  type: 'string' | 'integer' | 'number' | 'boolean'
  minLength?: number; maxLength?: number; minimum?: number; maximum?: number; enum?: readonly string[]
}
export interface OperationSchema {
  description: string
  readOnly: boolean
  timeoutMs?: number
  parameters: Record<string, ParameterSchema>
  required: readonly string[]
}
export const operations: Record<string, OperationSchema> = {
  'service.status': { description: descriptions['service.status'], readOnly: true, parameters: {}, required: [] },
  'doctor': { description: descriptions['doctor'], readOnly: true, parameters: {}, required: [] },
  'schema': { description: descriptions['schema'], readOnly: true, parameters: {}, required: [] },
  'devices.list': { description: descriptions['devices.list'], readOnly: false, parameters: {}, required: [] },
  'devices.capabilities': { description: descriptions['devices.capabilities'], readOnly: false, parameters: { device: { type: 'string', minLength: 1, maxLength: 1024 } }, required: ['device'] },
}
export interface AutomationRequest {
  apiVersion: 1; requestId: string; clientId: string; operation: string
  params: Record<string, unknown>; timeoutMs: number
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function invalid(message = 'Invalid request'): never { throw new AutomationFault('INVALID_ARGUMENT', message) }
export function parseRequest(value: unknown): AutomationRequest {
  if (!isRecord(value)) invalid()
  if (value.apiVersion !== API_VERSION) throw new AutomationFault('VERSION_MISMATCH', 'Protocol version must be 1')
  const allowed = ['apiVersion', 'requestId', 'clientId', 'operation', 'params', 'timeoutMs']
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid('Unknown request field')
  for (const field of ['requestId', 'clientId']) {
    if (typeof value[field] !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value[field] as string)) invalid(`Invalid ${field}`)
  }
  if (typeof value.operation !== 'string' || !Object.hasOwn(operations, value.operation)) invalid('Unknown operation')
  const definition = operations[value.operation as string]
  if (!isRecord(value.params)) invalid('Parameters must be an object')
  for (const key of definition.required) if (!Object.hasOwn(value.params, key)) invalid(`Missing parameter: ${key}`)
  for (const [key, item] of Object.entries(value.params)) {
    if (!Object.hasOwn(definition.parameters, key)) invalid(`Unknown parameter: ${key}`)
    const rule = definition.parameters[key]
    if (rule.type === 'string') {
      if (typeof item !== 'string' || item.length < (rule.minLength ?? 0) || item.length > (rule.maxLength ?? 16384) || (rule.enum && !rule.enum.includes(item))) invalid(`Invalid parameter: ${key}`)
    } else if (rule.type === 'boolean') {
      if (typeof item !== 'boolean') invalid(`Invalid parameter: ${key}`)
    } else if (typeof item !== 'number' || !Number.isFinite(item) || (rule.type === 'integer' && !Number.isInteger(item)) || item < (rule.minimum ?? -Infinity) || item > (rule.maximum ?? Infinity)) invalid(`Invalid parameter: ${key}`)
  }
  const timeoutMs = value.timeoutMs ?? definition.timeoutMs ?? 30000
  if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) invalid('timeoutMs must be an integer from 1 to 600000')
  return { apiVersion: 1, requestId: value.requestId as string, clientId: value.clientId as string, operation: value.operation as string, params: value.params, timeoutMs }
}
export function success<T>(requestId: string, data: T): AutomationResult<T> { return { apiVersion: 1, requestId, ok: true, data } }
export function failure(requestId: string, error: unknown): AutomationResult<never> {
  const fault = error instanceof AutomationFault ? error : new AutomationFault('INTERNAL', 'Operation failed')
  return { apiVersion: 1, requestId, ok: false, error: { code: fault.code, message: fault.message, outcome: fault.outcome, retryable: fault.retryable } }
}
export function exitCode(result: AutomationResult): number {
  if (result.ok) return 0
  const codes: Record<ErrorCode, number> = { INVALID_ARGUMENT: 2, VERSION_MISMATCH: 2, UNSUPPORTED: 3, NOT_FOUND: 4, UNAVAILABLE: 4, BUSY: 4, UNAUTHORIZED: 5, TIMEOUT: 6, OUTCOME_UNKNOWN: 7, INTERNAL: 7, CANCELLED: 130 }
  return codes[result.error.code] ?? 7
}
export function publicSchema() {
  return { apiVersion: API_VERSION, operations: Object.fromEntries(Object.entries(operations).map(([name, op]) => [name, {
    description: op.description, readOnly: op.readOnly, timeoutMs: op.timeoutMs ?? 30000,
    inputSchema: { type: 'object', properties: op.parameters, required: op.required, additionalProperties: false },
  }])) }
}
export function checkContext(context: AutomationContext) {
  if (context.signal.aborted) throw context.signal.reason instanceof AutomationFault ? context.signal.reason : new AutomationFault('CANCELLED', 'Operation cancelled')
  if (Date.now() >= context.deadline) throw new AutomationFault('TIMEOUT', 'Operation deadline exceeded', 'not-started', true)
}
