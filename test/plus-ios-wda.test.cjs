const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const net = require('node:net')
const fs = require('node:fs')
const load = require('./helpers/load-ios.cjs')
async function fixture(t, handle) {
  const seen = [], sockets = new Set()
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c
    seen.push({ method: req.method, path: req.url, body })
    handle(req, res, body)
  })
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  t.after(async () => { for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)) })
  const selected = []
  const api = load('src/main/lib/devices/ios-wda.ts', { './ios-usbmux': { connectIos: async (udid, port) => {
    selected.push([udid, port]); const s = net.connect(server.address().port, '127.0.0.1'); s.pause(); return s
  } } })
  return { api, client: new api.WdaClient('01234567'), seen, selected }
}
test('WDA uses USB for bounded chunked JSON, preserving exact write bodies', async t => {
  assert.ok(fs.existsSync('src/main/lib/devices/ios-wda.ts'), 'WDA transport is implemented')
  const f = await fixture(t, (_q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.write('{"value":'); r.end('{"ok":true}}') })
  const value = await f.client.request('POST', '/mobilerun/actions?scale=1', [{ type: 'pointerDown', x: 10, y: 20 }])
  assert.equal(value.value.ok, true)
  assert.deepEqual(f.selected, [['01234567', 8100]])
  assert.equal(f.seen[0].body, '[{"type":"pointerDown","x":10,"y":20}]')
})
test('WDA timeout and remote errors never replay an input write', async t => {
  assert.ok(fs.existsSync('src/main/lib/devices/ios-wda.ts'), 'WDA transport is implemented')
  const f = await fixture(t, (_q, r) => { if (f.seen.length > 1) r.end('{"value":{"error":"invalid argument"}}') })
  await assert.rejects(f.client.request('POST', '/actions', [], undefined, 50), /timed out/)
  assert.equal(f.seen.length, 1)
  await assert.rejects(f.client.request('POST', '/actions', []), /invalid argument/)
  assert.equal(f.seen.length, 2)
})
test('WDA rejects redirects, malformed envelopes and oversized announced bodies', async t => {
  assert.ok(fs.existsSync('src/main/lib/devices/ios-wda.ts'), 'WDA transport is implemented')
  const f = await fixture(t, (q, r) => {
    if(q.url === '/redirect') { r.writeHead(302, { location: 'http://example.com' }); r.end() }
    else if(q.url === '/large') { r.writeHead(200, { 'content-length': '100000000' }); r.write('x') }
    else r.end('{}')
  })
  for (const p of ['/redirect','/large','/bad']) await assert.rejects(f.client.request('GET', p))
  assert.equal(f.seen.length, 3)
})
