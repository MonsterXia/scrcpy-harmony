// Actual local Codex app-server MCP host, without a model turn or persistent chat.
// Usage: node script/check-automation-codex.mjs <new-private-output-dir> [android|harmony|both]
// Requires a configured `scrcpy-plus` MCP server and a running desktop service.
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'

const output = process.argv[2] && path.resolve(process.argv[2])
const mode = process.argv[3]
if (!output || (mode && !['android', 'harmony', 'both'].includes(mode))) throw Error('Use <new-private-output-dir> [android|harmony|both]')
await mkdir(output, { mode: 0o700 }) // Refuse existing evidence instead of overwriting failures.
const report = { host: 'real Codex app-server', codexVersion: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(), modelTurn: false, ephemeral: true, checks: [], devices: [] }
const child = spawn('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] })
let sequence = 0, buffer = '', stderr = '', threadId
const pending = new Map()
const exited = new Promise(resolve => {
  child.once('exit', (code, signal) => resolve({ code, signal }))
  child.once('error', error => resolve({ code: null, error: error.message }))
})
child.stderr.on('data', chunk => { if (stderr.length < 1024 * 1024) stderr += chunk })
const failPending = error => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error) } pending.clear() }
child.on('error', failPending)
child.on('exit', () => failPending(Error('Codex host exited')))
child.stdin.on('error', failPending)
child.stdout.on('data', chunk => {
  buffer += chunk
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
    let message
    try { message = JSON.parse(line) } catch { continue }
    const p = pending.get(message.id)
    if (p) {
      clearTimeout(p.timer); pending.delete(message.id)
      message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result)
    } else if (message.id !== undefined) {
      child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Unexpected host request in deterministic acceptance' } }) + '\n')
    }
  }
})
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`Host deadline: ${method}`)) }, 45000)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
  })
}
async function call(tool, args = {}) {
  const result = await rpc('mcpServer/tool/call', { threadId, server: 'scrcpy-plus', tool, arguments: args })
  const value = result.structuredContent
  report.checks.push({ tool, ok: value?.ok, isError: result.isError, code: value?.error?.code })
  return { tool, result, value }
}
function requireOk(response) {
  assert.equal(response.value?.ok, true, `${response.tool}: ${response.value?.error?.code || 'invalid result'}`)
  assert.equal(response.result.isError, false)
  return response.value.data
}
try {
  await rpc('initialize', { clientInfo: { name: 'scrcpy_plus_acceptance', version: '1.0.0' }, capabilities: { experimentalApi: true } })
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
  threadId = (await rpc('thread/start', { cwd: process.cwd(), ephemeral: true, approvalPolicy: 'never' })).thread.id
  const inventory = await rpc('mcpServerStatus/list', { threadId, serverName: 'scrcpy-plus' })
  const server = inventory.data.find(server => server.name === 'scrcpy-plus')
  assert.ok(server); report.toolCount = Object.keys(server.tools).length
  const schema = requireOk(await call('schema')); assert.equal(report.toolCount, Object.keys(schema.operations).length)
  report.serviceVersion = requireOk(await call('service_status')).version
  const discovery = requireOk(await call('devices_list')); report.providerErrors = discovery.errors.length
  report.platforms = discovery.devices.map(device => device.platform)
  for (const device of discovery.devices.filter(d => ['android', 'harmony'].includes(d.platform))) requireOk(await call('devices_capabilities', { device: device.key }))
  const invalid = await call('input_tap', { session: 'invalid', frame: 'invalid', x: -1, y: 0 })
  assert.equal(invalid.result.isError, true); assert.equal(invalid.value.error.code, 'INVALID_ARGUMENT')
  // Do not acquire or clean someone else's existing persistent leases.
  assert.deepEqual(requireOk(await call('sessions_leases')), [])
  const platforms = mode === 'both' ? ['android', 'harmony'] : mode ? [mode] : []
  for (const platform of platforms) {
    const targets = discovery.devices.filter(d => d.platform === platform && d.state === 'ready')
    assert.equal(targets.length, 1, `Select exactly one ready ${platform} device before this acceptance`)
    const device = targets[0], record = { platform }; report.devices.push(record)
    if (platform === 'harmony') {
      requireOk(await call('overview_get', { device: device.key }))
      const layout = await call('layout_dump', { device: device.key }); requireOk(layout)
      const resource = layout.result.content.find(item => item.type === 'resource')
      assert.equal(resource?.resource.mimeType, 'application/xml'); assert.ok(resource.resource.blob)
      record.xmlBytes = Buffer.from(resource.resource.blob, 'base64').length
    }
    const session = requireOk(await call('sessions_start', { device: device.key }))
    try {
      requireOk(await call('sessions_wait', { session: session.sessionId, state: 'running', timeoutMs: 20000 }))
      const captured = await call('screen_capture', { session: session.sessionId, timeoutMs: 5000 }); const data = requireOk(captured)
      const image = captured.result.content.find(item => item.type === 'image'); assert.equal(image?.mimeType, 'image/png')
      const bytes = Buffer.from(image.data, 'base64'); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
      record.frame = { width: data.frame.width, height: data.frame.height, stale: data.frame.stale, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
      await writeFile(path.join(output, `${platform}-private.png`), bytes, { mode: 0o600 })
    } finally {
      const start = Date.now(), released = requireOk(await call('sessions_release', { lease: session.leaseId }))
      record.release = { state: released.state, elapsedMs: Date.now() - start }
    }
  }
  report.finalLeases = requireOk(await call('sessions_leases')).length
  assert.equal(report.finalLeases, 0); report.passed = true
} catch (error) {
  report.passed = false; report.failure = error.message; process.exitCode = 1
} finally {
  child.stdin.end()
  const timer = setTimeout(() => child.kill('SIGTERM'), 2000)
  report.hostExit = await exited; clearTimeout(timer)
  if (report.hostExit.code !== 0) { report.passed = false; process.exitCode = 1 }
  await writeFile(path.join(output, 'host-private.stderr.log'), stderr, { mode: 0o600 })
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ passed: report.passed, tools: report.toolCount, devices: report.devices.length, failure: report.failure }))
}
