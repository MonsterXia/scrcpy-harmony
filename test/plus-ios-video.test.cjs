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
  const video = new IosVideo(client,'ours',{width:390,height:844,rotation:0},f=>frames.push(f),()=>{},'runner-0001')
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

test('lost video stop acknowledgement accepts only a capture confirmed absent', async t=>{
  const f=await fixture(t,false,false,false,true);await f.video.start()
  const original=f.client.request.bind(f.client)
  f.client.request=async(method,path,body)=>{
    if(path.endsWith('/7/stop'))throw Error('WDA HTTP 404')
    if(path==='/status')return {sessionId:null,value:{ready:true}}
    if(path==='/mobilerun/screencapture/7')return {value:null}
    return original(method,path,body)
  }
  await f.video.close()
  assert.equal(f.socket.destroyed,true)
})
test('video cleanup preserves ownership if the capture still exists or cannot be queried',async t=>{
  const f=await fixture(t,false,false,false,true);await f.video.start()
  const original=f.client.request.bind(f.client);let reachable=true
  f.client.request=async(method,path,body)=>{
    if(path.endsWith('/7/stop'))throw Error('WDA HTTP 404')
    if(path==='/status') {if(!reachable)throw Error('USB unavailable');return {sessionId:'different-session',value:{ready:true}}}
    if(path==='/mobilerun/screencapture/7')return {value:{id:7}}
    return original(method,path,body)
  }
  await assert.rejects(f.video.close());reachable=false;await assert.rejects(f.video.close())
  f.client.request=original;await f.video.close()
  assert.equal(f.calls.some(c=>c.path.includes('different-session')),false)
})

test('lost capture allocation is not reported cleaned until its Runner process is replaced',async()=>{
 let runner='runner-0001',allocated=false,stops=0
 const client={async request(method,path){
  if(path==='/status')return {value:{ready:true,scrcpyPlusProtocolVersion:1,scrcpyPlusRunnerId:runner}}
  if(path.endsWith('/broadcast'))return {value:{state:'idle',sessions:[],audioSessions:[]}}
  if(path.endsWith('/start')){allocated=true;throw Error('capture response lost')}
  if(path.endsWith('/stop'))stops++
 }}
 const {IosVideo}=api(),video=new IosVideo(client,'ours',{width:390,height:844,rotation:0},()=>{},()=>{},runner)
 await assert.rejects(video.start(),/response lost/);assert.equal(allocated,true)
 await assert.rejects(video.close(),e=>e.code==='IOS_WDA_ALLOCATION_UNKNOWN');assert.equal(stops,0)
 runner='runner-0002';await video.close();assert.equal(stops,0)
})
