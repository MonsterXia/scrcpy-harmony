import { encodeResult } from '../../common/automation/wire'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { AutomationFault, MAX_REQUEST_BYTES, failure, operations, parseRequest } from '../../common/automation/protocol'
import type { AutomationRequest, AutomationContext, AutomationResult } from '../../common/automation/protocol'
import { createToken, isAuthorized } from './auth'
import { acquireOwnership, discoveryDirectory, publishDiscovery, removeDiscovery, secureDirectory } from './discovery'

export interface ServerOptions {
  profilePath: string
  host?: '127.0.0.1'
  instanceId?: string
  recoverStaleLock?: boolean
  dispatch(request: AutomationRequest, context: AutomationContext): Promise<AutomationResult>
}
export async function startAutomationServer(options: ServerOptions) {
  if (options.host !== undefined && options.host !== '127.0.0.1') throw new AutomationFault('INVALID_ARGUMENT', 'Only loopback binding is supported')
  const instanceId = options.instanceId ?? randomUUID(), token = createToken()
  const directory = discoveryDirectory(options.profilePath)
  await secureDirectory(directory)
  const release = await acquireOwnership(directory, instanceId, options.recoverStaleLock === true)
  const active = new Set<AbortController>()
  let host = '', closing: Promise<void> | undefined
  const server = createServer((request, response) => { void handle(request, response) })
  server.headersTimeout = 10000
  server.requestTimeout = 15000
  server.timeout = 0
  server.keepAliveTimeout = 1000
  function send(response: ServerResponse, status: number, result: AutomationResult) {
    if (response.destroyed || response.writableEnded) return
    const encoded = encodeResult(result)
    response.writeHead(status, { 'content-type': encoded.type, 'content-length': encoded.body.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', connection: 'close' })
    response.end(encoded.body)
  }
  async function handle(request: IncomingMessage, response: ServerResponse) {
    let requestId = 'invalid-request', timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    try {
      if (!isAuthorized(request, token, host, instanceId)) { request.resume(); send(response, 403, failure(requestId, new AutomationFault('UNAUTHORIZED', 'Local service authorization failed'))); return }
      if (closing) throw new AutomationFault('UNAVAILABLE', 'Service is stopping')
      if (request.method !== 'POST' || request.url !== '/v1/call' || request.headers['content-type']?.split(';')[0] !== 'application/json') throw new AutomationFault('INVALID_ARGUMENT', 'Use POST /v1/call with application/json')
      const chunks: Buffer[] = []; let size = 0
      // Bound both an advertised body and chunked transfer; never dispatch partial JSON.
      if (Number(request.headers['content-length']) > MAX_REQUEST_BYTES) throw new AutomationFault('INVALID_ARGUMENT', 'Request exceeds 1 MiB')
      const raw = await new Promise<Buffer>((resolve, reject) => {
        const bodyTimer = setTimeout(() => fail(new AutomationFault('TIMEOUT', 'Request body timed out')), 10000)
        const cleanup = () => { clearTimeout(bodyTimer); request.removeListener('data', onData); request.removeListener('end', onEnd); request.removeListener('error', onError); request.removeListener('aborted', onAbort) }
        const fail = (error: Error) => { cleanup(); reject(error); request.resume() }
        const onData = (chunk: Buffer) => { size += chunk.length; if (size > MAX_REQUEST_BYTES) fail(new AutomationFault('INVALID_ARGUMENT', 'Request exceeds 1 MiB')); else chunks.push(chunk) }
        const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks)) }
        const onError = () => fail(new AutomationFault('CANCELLED', 'Request stream closed'))
        const onAbort = () => fail(new AutomationFault('CANCELLED', 'Request aborted'))
        request.on('data', onData); request.on('end', onEnd); request.on('error', onError); request.on('aborted', onAbort)
      })
      let value: unknown
      try { value = JSON.parse(raw.toString('utf8')) } catch { throw new AutomationFault('INVALID_ARGUMENT', 'Malformed JSON') }
      const parsed = parseRequest(value); requestId = parsed.requestId
      controller = new AbortController(); active.add(controller)
      const current = controller
      const uncertain = !operations[parsed.operation].readOnly
      const outcome = uncertain ? 'unknown' : 'not-started'
      const deadline = Date.now() + parsed.timeoutMs
      const cancelled = new Promise<never>((_resolve, reject) => current.signal.addEventListener('abort', () => reject(current.signal.reason), { once: true }))
      response.on('close', () => { if (!response.writableEnded) current.abort(new AutomationFault('CANCELLED', 'Client disconnected', outcome)) })
      timer = setTimeout(() => current.abort(new AutomationFault('TIMEOUT', 'Operation deadline exceeded', outcome, !uncertain)), parsed.timeoutMs)
      const work = options.dispatch(parsed, { clientId: parsed.clientId, deadline, signal: current.signal })
      const result = await Promise.race([work, cancelled])
      send(response, 200, result)
    } catch (error) {
      request.resume()
      send(response, 400, failure(requestId, error))
    } finally {
      clearTimeout(timer)
      if (controller) active.delete(controller)
    }
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Invalid address')
    host = `127.0.0.1:${address.port}`
    const endpoint = `http://${host}`
    await publishDiscovery(directory, { apiVersion: 1, endpoint, instanceId, token, pid: process.pid })
    return { endpoint, instanceId, close() {
      if (!closing) closing = (async () => {
        for (const controller of active) controller.abort(new AutomationFault('CANCELLED', 'Service is stopping', 'unknown'))
        await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
        try { await removeDiscovery(directory, instanceId) } finally { await release() }
      })()
      return closing
    } }
  } catch (error) {
    server.close(); server.closeAllConnections()
    await release()
    throw error
  }
}
