const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const load = require('./helpers/load-ios.cjs')
const png = fs.readFileSync(require('node:path').join(__dirname, 'fixtures/ios-screen.png'))
function fixture(t, options = {}) {
  assert.ok(fs.existsSync('src/main/lib/devices/ios.ts'), 'iOS backend is implemented')
  const calls = [], frames = [], states = []
  let rotation = 0
  class WdaClient {
    async request(method, path, body, signal, timeout) {
      calls.push({ method, path, body, timeout })
      if (path === '/status') return { sessionId: options.busy ? 'someone-else' : null, value: { ready: true } }
      if (path === '/session') return { value: { sessionId: 'our-session' } }
      if (path.endsWith('/wda/screen')) return { value: { screenSize: { width: 390, height: 844 }, scale: 3 } }
      if (path.endsWith('/rotation') && options.readDelay) await new Promise(r => setTimeout(r, options.readDelay))
      if (path.endsWith('/rotation')) return { value: { x: 0, y: 0, z: rotation } }
      if (path.endsWith('/screenshot')) return { value: png.toString('base64') }
      if (path.includes('/actions') && options.failInput) throw Error('Lost input acknowledgement')
      return { value: null }
    }
  }
  const real = load('src/main/lib/devices/ios-wda.ts', { './ios-usbmux': {} })
  const { IosMirror } = load('src/main/lib/devices/ios.ts', { './ios-wda': { ...real, WdaClient }, './ios-usbmux': {}, ...(options.video ? {'./ios-video': {IosVideo: options.video}} : {}) })
  const mirror = new IosMirror({ key: 'ios:01234567', connectionId: '01234567', platform: 'ios', transport: 'usb' })
  t.after(() => mirror.close())
  return { mirror, calls, frames, states, rotate: n => { rotation = n }, start: () => mirror.start(f => frames.push(f), s => states.push(s)) }
}
test('iOS starts with PNG, maps normalized tap to points and only deletes its own WDA session', async t => {
  const f = fixture(t); await f.start()
  assert.equal(f.frames[0].format, 'png')
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(c => c.path.endsWith('/appium/settings'))?.body)), { settings: { screenshotQuality: 0 } })
  await f.mirror.input({ type: 'touch', action: 'down', x: .5, y: .25 }, { width: 390, height: 844, rotation: 0 })
  assert.equal(f.calls.filter(c => c.path.includes('/actions')).length, 0)
  await f.mirror.input({ type: 'touch', action: 'up', x: .5, y: .25 }, { width: 390, height: 844, rotation: 0 })
  const action = f.calls.find(c => c.path.includes('/actions'))
  assert.equal(action.path, '/session/our-session/mobilerun/actions?scale=1')
  assert.deepEqual(JSON.parse(JSON.stringify(action.body)), [
    { type: 'pointerDown', x: 195, y: 211 }, { type: 'pause', duration: 50 }, { type: 'pointerUp' },
  ])
  await f.mirror.close()
  assert.deepEqual(f.calls.filter(c => c.method === 'DELETE').map(c => c.path), ['/session/our-session'])
})
test('iOS refuses to replace another WDA session', async t => {
  const f = fixture(t, { busy: true })
  await assert.rejects(f.start(), /already in use/)
  assert.equal(f.calls.some(c => c.method === 'POST' || c.method === 'DELETE'), false)
})

test('lost session delete response requires a valid status proving our session is gone', async t => {
  const f = fixture(t); await f.start()
  const request = f.mirror.client.request.bind(f.mirror.client)
  let status = { sessionId: 'our-session', value: { ready: true } }
  f.mirror.client.request = async (method,path,...args) => {
    if (method === 'DELETE') throw Error('delete response lost')
    if (path === '/status') return status
    return request(method,path,...args)
  }
  await assert.rejects(f.mirror.close(), /delete response lost/)
  status = { value: { ready: true } }
  await assert.rejects(f.mirror.close(), /delete response lost/)
  status = { sessionId: 'another-session', value: { ready: true } }
  await f.mirror.close()
})
test('rotation between press and release prevents input instead of clicking stale coordinates', async t => {
  const f = fixture(t); await f.start()
  await f.mirror.input({ type: 'touch', action: 'down', x: .5, y: .5 }, { width: 390, height: 844, rotation: 0 })
  f.rotate(180)
  await assert.rejects(f.mirror.input({ type: 'touch', action: 'up', x: .5, y: .5 }, { width: 390, height: 844, rotation: 0 }), /changed/)
  assert.equal(f.calls.some(c => c.path.includes('/actions')), false)
})
test('cancelled GUI gesture and aborted automation never commit a tap', async t => {
  const f = fixture(t); await f.start()
  await f.mirror.input({ type: 'touch', action: 'down', x: .5, y: .5 }, { width: 390, height: 844, rotation: 0 })
  await f.mirror.input({ type: 'touch', action: 'cancel', x: .5, y: .5 }, { width: 390, height: 844, rotation: 0 })
  const controller = new AbortController(); controller.abort()
  await assert.rejects(f.mirror.perform({ type: 'tap', x: 1, y: 1 }, { width: 390, height: 844, rotation: 0 }, controller.signal))
  assert.equal(f.calls.some(c => c.path.includes('/actions')), false)
})
test('uncertain WDA input blocks subsequent writes and is never retried', async t => {
  const f = fixture(t, { failInput: true }); await f.start()
  for(let i=0;i<2;i++) await assert.rejects(f.mirror.perform({ type: 'tap', x: 1, y: 1 }, { width: 390, height: 844, rotation: 0 }))
  assert.equal(f.calls.filter(c => c.path.includes('/actions')).length, 1)
})

test('GUI requires displayed geometry and rejects mismatched frame aspect ratio', async t => {
  const f = fixture(t); await f.start()
  await assert.rejects(f.mirror.input({ type:'touch',action:'down',x:.5,y:.5 }), /display/)
  await assert.rejects(f.mirror.input({ type:'scroll',x:.5,y:.5,dx:0,dy:.1 }, {width:844,height:390,rotation:0}), /display/)
  assert.equal(f.calls.some(c=>c.path.includes('/actions')),false)
})

test('geometry roundtrip latency is not added to a quick click hold duration', async t => {
  const options = {}, f = fixture(t, options); await f.start()
  const display = {width:390,height:844,rotation:0}
  await f.mirror.input({type:'touch',action:'down',x:.5,y:.5},display)
  options.readDelay=100
  await f.mirror.input({type:'touch',action:'up',x:.5,y:.5},display)
  assert.equal(f.calls.find(c=>c.path.includes('/actions')).body[1].duration,50)
})

test('maximum duration swipe has transport overhead budget beyond its gesture duration',async t=>{
  const f=fixture(t);await f.start()
  await f.mirror.perform({type:'swipe',x:10,y:10,toX:100,toY:100,durationMs:10000},{width:390,height:844,rotation:0})
  assert.ok(f.calls.find(c=>c.path.includes('/actions')).timeout>10000)
})

test('failed video startup cleans capture and resumes PNG preview',async t=>{
  let closed=0
  const f=fixture(t,{video:class {async start(){throw Error('broadcast timeout')}async close(){closed++}}})
  await f.start()
  await assert.rejects(f.mirror.setVideo(true),/broadcast timeout/)
  assert.equal(closed,1);assert.equal(f.frames.length,2);assert.equal(f.states.at(-1),'video-error')
})
test('closing while video starts waits for owned resource cleanup and emits no late frame',async t=>{
  let release, entered, closed=0
  const started=new Promise(r=>entered=r), work=new Promise(r=>release=r)
  const f=fixture(t,{video:class {async start(){entered();await work}async close(){closed++}}})
  await f.start()
  const opening=f.mirror.setVideo(true);const rejected=assert.rejects(opening,/closed/)
  await started;const closing=f.mirror.close();release();await rejected;await closing
  assert.ok(closed>=1);assert.equal(f.frames.length,1)
  assert.equal(f.calls.filter(c=>c.method==='DELETE').length,1)
})

test('video stop requested during startup waits then returns to PNG',async t=>{
  let release,entered,closed=0
  const started=new Promise(r=>entered=r), work=new Promise(r=>release=r)
  const f=fixture(t,{video:class {async start(){entered();await work}async close(){closed++}}})
  await f.start();const opening=f.mirror.setVideo(true);await started
  const stopping=f.mirror.setVideo(false);const observed=stopping.catch(error=>error)
  release();await opening;const result=await observed
  assert.equal(result,undefined);assert.equal(closed,1);assert.equal(f.states.at(-1),'screenshot')
})
