const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const net = require('node:net')
const { transformSync } = require('esbuild')
async function fixture(t, malformed = false, values = { DeviceName: 'iPhone Fixture' }) {
  const plist = await import('plist'), seen = [], sockets = new Set()
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {})
    let data = Buffer.alloc(0), mux = true
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk])
      const header = mux ? 16 : 4
      if (data.length < header) return
      const length = mux ? data.readUInt32LE(0) : data.readUInt32BE(0) + 4
      if (data.length < length) return
      const request = plist.parse(data.subarray(header, length).toString()); data = data.subarray(length)
      seen.push(request)
      let value
      if (request.MessageType === 'ListDevices') value = { DeviceList: [
        { DeviceID: 9, Properties: { SerialNumber: '01234567-1234567890abcdef', ConnectionType: 'USB' } },
        { DeviceID: 10, Properties: { SerialNumber: 'invalid' } },
      ] }
      else if (request.MessageType === 'Connect') { assert.equal(request.PortNumber, 32498); value = { Number: 0 } }
      else { assert.equal(request.Request, 'GetValue'); value = values[request.Key] ? { Value: values[request.Key] } : { Error: 'MissingValue' } }
      const bytes = Buffer.from(plist.build(value)), prefix = Buffer.alloc(header)
      if (mux) { prefix.writeUInt32LE(bytes.length + header); prefix.writeUInt32LE(1,4); prefix.writeUInt32LE(8,8); prefix.writeUInt32LE(malformed ? 99 : 1,12) }
      else prefix.writeUInt32BE(bytes.length)
      // Exercise a header/body split over real TCP, not a mocked parser.
      socket.write(prefix); setImmediate(() => { if (!socket.destroyed) socket.write(bytes) })
      if (request.MessageType === 'Connect') mux = false
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)) })
  const module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync('src/main/lib/devices/ios-usbmux.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    { module, exports: module.exports, Buffer, process, setTimeout, clearTimeout, AbortSignal,
      require(id) {
        if (id === 'node:net') return { createConnection: () => net.connect(server.address().port, '127.0.0.1') }
        if (id === 'plist') return plist
        return require(id)
      },
    })
  return { ...module.exports, seen, sockets }
}
test('iOS discovery speaks framed usbmux and lockdown directly and keeps the USB identity', async t => {
  const f = await fixture(t), targets = await f.discoverIos()
  assert.equal(targets.length, 1)
  assert.equal(targets[0].key, 'ios:01234567-1234567890abcdef')
  assert.equal(targets[0].name, 'iPhone Fixture')
  assert.equal(targets[0].state, 'ready')
  assert.deepEqual(f.seen.map(x => x.MessageType || x.Request), ['ListDevices', 'Connect', 'GetValue'])
})
test('invalid usbmux tags reject instead of selecting an unrelated reply', async t => {
  const f = await fixture(t, true)
  await assert.rejects(f.discoverIos(), /header/)
})
test('device list validates serials and IDs before using them in another protocol request', async t => {
  const f = await fixture(t)
  assert.deepEqual(Array.from(f.muxDevices({ DeviceList: [{ DeviceID: -1, Properties: { SerialNumber: '01234567' } }, { DeviceID: 1, Properties: { SerialNumber: 'not-a-udid' } }] })), [])
  assert.throws(() => f.muxDevices({}), /device list/)
})

test('iOS overview reads an allowlist over lockdown and omits unavailable fields without WDA',async t=>{
 const f=await fixture(t,false,{DeviceName:'iPhone Fixture',ProductVersion:'26.4',BuildVersion:'24A1',ProductType:'iPhone14,5',HardwareModel:'D17AP',CPUArchitecture:'arm64e'})
 const result=await f.getIosOverview({key:'ios:01234567-1234567890abcdef',connectionId:'01234567-1234567890abcdef',platform:'ios',transport:'usb',name:'USB iPhone'})
 assert.equal(result.osVersion,'iOS 26.4');assert.equal(result.model,'iPhone14,5');assert.equal(result.abi,'arm64e');assert.equal(result.serialNum,undefined)
 assert.deepEqual(f.seen.filter(x=>x.Request).map(x=>x.Key),['DeviceName','ProductVersion','BuildVersion','ProductType','HardwareModel','CPUArchitecture','SerialNumber','DeviceClass','ModelNumber'])
 assert.equal(f.seen.filter(x=>x.MessageType==='Connect').length,1)
 const count=f.seen.length
 await assert.rejects(f.getIosOverview({key:'ios:airplay-receiver',platform:'ios',transport:'receiver'}),/Invalid/)
 assert.equal(f.seen.length,count)
})
