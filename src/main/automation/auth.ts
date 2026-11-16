import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
export function createToken() { return randomBytes(32).toString('hex') }
export function isAuthorized(request: IncomingMessage, token: string, host: string, instanceId: string) {
  if (request.headers.origin !== undefined || request.headers.host !== host || request.headers['x-scrcpy-instance'] !== instanceId) return false
  const authorization = request.headers.authorization
  if (typeof authorization !== 'string') return false
  const expected = Buffer.from(`Bearer ${token}`), actual = Buffer.from(authorization)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
