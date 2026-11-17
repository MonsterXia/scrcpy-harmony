const { test } = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const load = require('./helpers/load-ios.cjs')
const udid = '01234567-1234567890abcdef'
async function fixture(t, options = {}) {
  const plist = await import('plist'), seen = [], sockets = new Set()
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {})
    let pending = Buffer.alloc(0)
    socket.on('data', chunk => {
      pending = Buffer.concat([pending, chunk])
      if (pending.length < 16 || pending.length < pending.readUInt32LE(0)) return
      const req = plist.parse(pending.subarray(16).toString()); seen.push(req)
      if (options.hang) return
      const value = req.MessageType === 'ListDevices' ? { DeviceList: [
        { DeviceID: 4, Properties: { SerialNumber: 'abcdefab', ConnectionType: 'USB' } },
        { DeviceID: 8, Properties: { SerialNumber: udid, ConnectionType: 'USB' } },
      ] } : { Number: options.refuse ? 3 : 0 }
      const bytes = Buffer.from(plist.build(value)), header = Buffer.alloc(16)
      header.writeUInt32LE(16 + bytes.length); header.writeUInt32LE(1,4); header.writeUInt32LE(8,8); header.writeUInt32LE(1,12)
      socket.write(Buffer.concat([header, bytes, ...(req.MessageType === 'Connect' ? [Buffer.from('first-video-bytes')] : [])]))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)) })
  const api = load('src/main/lib/devices/ios-usbmux.ts', {
    plist, 'node:net': { createConnection: () => net.connect(server.address().port, '127.0.0.1') },
  })
  return { api, seen, sockets }
}
test('USB connects to the requested UDID and port, retaining coalesced protocol bytes', async t => {
  const f = await fixture(t)
  assert.equal(typeof f.api.connectIos, 'function')
  const socket = await f.api.connectIos(udid, 8100)
  t.after(() => socket.destroy())
  assert.equal(f.seen[1].DeviceID, 8)
  assert.equal(f.seen[1].PortNumber, 42015)
  const data = await new Promise(resolve => { socket.once('data', resolve); socket.resume() })
  assert.equal(data.toString(), 'first-video-bytes')
})
test('missing UDID never connects to another device and refused connections close', async t => {
  const f = await fixture(t, { refuse: true })
  assert.equal(typeof f.api.connectIos, 'function')
  await assert.rejects(f.api.connectIos('ffffffff', 8100), /not found/i)
  assert.equal(f.seen.filter(x => x.MessageType === 'Connect').length, 0)
  await assert.rejects(f.api.connectIos(udid, 8100), /connection refused/i)
})
test('USB connection cancellation closes an unanswered request', async t => {
  const f = await fixture(t, { hang: true }), controller = new AbortController()
  assert.equal(typeof f.api.connectIos, 'function')
  const result = f.api.connectIos(udid, 8100, controller.signal)
  controller.abort()
  await assert.rejects(result)
})
