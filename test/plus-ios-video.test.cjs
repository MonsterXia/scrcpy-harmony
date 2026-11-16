const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PassThrough } = require('node:stream')
const load = require('./helpers/load-ios.cjs')
function api(mocks = {}) {
  assert.ok(fs.existsSync('src/main/lib/devices/ios-video.ts'), 'iOS video transport is implemented')
  return load('src/main/lib/devices/ios-video.ts', { './ios-usbmux': {}, ...mocks })
}
function packet(flags, pts, bytes) {
  const h = Buffer.alloc(12); h.writeBigUInt64BE(flags | BigInt(pts)); h.writeUInt32BE(bytes.length,8)
  return Buffer.concat([h,Buffer.from(bytes)])
}
test('scrcpy framing preserves fragmented and coalesced H264 config/keyframe timestamps', () => {
  const { IosVideoParser } = api(), frames = [], p = new IosVideoParser(f => frames.push(f))
  const bytes = Buffer.concat([packet(1n<<63n,0,[0,0,0,1,0x67]),packet(1n<<62n,12345,[0,0,0,1,0x65])])
  p.push(bytes.subarray(0,7)); p.push(bytes.subarray(7,18)); p.push(bytes.subarray(18))
  assert.equal(frames.length,2); assert.equal(frames[0].config,true); assert.equal(frames[1].keyFrame,true); assert.equal(frames[1].timestamp,12345)
})
test('video parser rejects oversized packets before buffering their payload', () => {
  const { IosVideoParser } = api(), p = new IosVideoParser(()=>{})
  const h = Buffer.alloc(12); h.writeUInt32BE(9000000,8)
  assert.throws(()=>p.push(h),/size/)
})
async function fixture(t, busy = false, early = false, failStart = false, existingBroadcast = false) {
  const calls = [], socket = new PassThrough(), frames = []
  let connected = existingBroadcast, sessions = busy ? [{id:9}] : []
  const client = { udid:'01234567', async request(method,path,body) {
    calls.push({method,path,body})
    if(path.endsWith('/broadcast')) return {value:{state:connected?'connected':'idle', connectedAt:connected?123:null,sessions,audioSessions:[]}}
    if(path.endsWith('/broadcast/start')) {if(failStart) throw Error('broadcast response lost');if(early) socket.write(packet(1n<<63n,0,[0,0,0,1,0x67]));connected=true;return {value:{state:'connected',connectedAt:123}}}
    if(path.endsWith('/broadcast/stop')) {connected=false;return {value:{state:'idle'}}}
    if(path.endsWith('/screencapture/start')) {sessions=[{id:7}]; return {value:{id:7,port:9201,codec:'h264',framing:'scrcpy'}}}
    if(path.endsWith('/7/stop')) sessions=[]
    return {value:null}
  }}
  const { IosVideo } = api({'./ios-usbmux':{ connectIos: async (udid,port)=>{assert.equal(udid,'01234567');assert.equal(port,9201);return socket} }})
  const video = new IosVideo(client,'ours',{width:390,height:844,rotation:0},f=>frames.push(f),()=>{})
  t.after(()=>video.close())
  return {video,calls,socket,frames,client}
}
test('ReplayKit video owns one capture and only stops its own capture, never the global broadcast',async t=>{
  const f=await fixture(t);await f.video.start()
  f.socket.write(packet(1n<<62n,2,[0,0,0,1,0x65]))
  assert.equal(f.frames.length,1)
  await f.video.close()
  assert.ok(f.calls.some(c=>c.path.endsWith('/7/stop')))
  assert.equal(f.calls.some(c=>c.path.endsWith('/broadcast/stop')),false)
  assert.equal(f.calls.some(c=>c.path.endsWith('/screencapture/stop')),false)
  assert.equal(f.socket.destroyed,true)
})
test('ReplayKit refuses an already-owned capture without issuing start or stop writes',async t=>{
  const f=await fixture(t,true);await assert.rejects(f.video.start(),/already in use/)
  await f.video.close()
  assert.equal(f.calls.some(c=>c.method==='POST'),false)
})

test('configuration arriving before broadcast-start response survives startup', async t=>{
  const f=await fixture(t,false,true); await f.video.start()
  f.socket.write(packet(1n<<62n,2,[0,0,0,1,0x65]))
  assert.equal(f.frames.length,2)
  assert.equal(f.frames[0].config,true)
  assert.equal(f.frames[1].keyFrame,true)
})

test('uncertain broadcast start can still clean its known capture',async t=>{
  const f=await fixture(t,false,false,true); await assert.rejects(f.video.start(),/lost/)
  await f.video.close()
  assert.ok(f.calls.some(c=>c.path.endsWith('/7/stop')))
  assert.equal(f.calls.some(c=>c.path.endsWith('/broadcast/stop')),false)
})
test('existing connected broadcast can serve another owned capture without global lifecycle writes',async t=>{
  const f=await fixture(t,false,false,false,true); await f.video.start(); await f.video.close()
  assert.equal(f.calls.some(c=>c.path.endsWith('/broadcast/start')||c.path.endsWith('/broadcast/stop')),false)
})

test('lost capture stop response is accepted only after an explicit absent read', async t => {
  const f = await fixture(t); await f.video.start()
  const request = f.client.request.bind(f.client)
  let probe = { value: { id: 7 } }
  f.client.request = async (method, path, ...args) => {
    if (path.endsWith('/7/stop')) { await request(method,path,...args); throw Error('stop response lost') }
    if (path === '/mobilerun/screencapture/7') return probe
    return request(method,path,...args)
  }
  await assert.rejects(f.video.close(), /stop response lost/)
  probe = { value: {} }
  await assert.rejects(f.video.close(), /stop response lost/)
  probe = { value: null }
  await f.video.close()
  assert.equal(f.calls.some(c=>c.path.endsWith('/broadcast/stop')),false)
})
