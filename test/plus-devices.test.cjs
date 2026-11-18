const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
function load(file, mocks = {}) {
  mocks = { '../ios-provisioning': { renewIos: async () => {}, disposeIosSetup() {} }, ...mocks }
  const module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    { module, exports: module.exports, __filename: path.resolve(file), console, process, Buffer, Error, setTimeout, clearTimeout, setInterval, clearInterval,
      require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id) })
  return module.exports
}
const config = Uint8Array.from([0,0,0,1,0x67,0x42,0,0x1f,0,0,0,1,0x68,0x11])
const key = Uint8Array.from([0,0,0,1,0x65,1])
const delta = Uint8Array.from([0,0,0,1,0x41,2])
const gateFixture = () => new (load('src/main/lib/devices/media.ts').FrameGate)()
test('video backpressure drops incomplete GOPs and restores configuration with the next keyframe', () => {
  const gate = gateFixture()
  assert.equal(gate.push({ data: delta, timestamp: 0 }), undefined)
  gate.push({ data: config, config: true, timestamp: 0 })
  const first = gate.push({ data: key, timestamp: 1 })
  assert.equal(first.reset, true)
  assert.deepEqual(Array.from(first.configuration), Array.from(config))
  const second = gate.push({ data: delta, timestamp: 2 })
  assert.ok(second)
  assert.equal(gate.push({ data: delta, timestamp: 3 }), undefined)
  gate.ack(first.sequence)
  assert.equal(gate.push({ data: delta, timestamp: 4 }), undefined)
  const recovered = gate.push({ data: key, timestamp: 5 })
  assert.equal(recovered.reset, true)
  assert.ok(recovered.configuration)
})
test('codec changes and native queue loss require another keyframe', () => {
  const gate = gateFixture()
  gate.push({ data: config, config: true, timestamp: 0 })
  const frame = gate.push({ data: key, timestamp: 1 }); gate.ack(frame.sequence)
  const changed = config.slice(); changed[6] = 1
  gate.push({ data: changed, config: true, timestamp: 2 })
  assert.equal(gate.push({ data: delta, timestamp: 3 }), undefined)
  const next = gate.push({ data: key, timestamp: 4 }); gate.ack(next.sequence)
  assert.deepEqual(Array.from(next.configuration), Array.from(changed))
  assert.equal(gate.push({ data: delta, timestamp: 5, reset: true }), undefined)
})
function androidFixture(directory, filesystem = fs.promises, localAdb = async () => { throw Error("No local ADB server") }) {
  const devices = ['a', 'b'].map(serial => ({ serial, name: 'Same model',
    closes: 0, connects: 0, raw: { claimInterface: async () => {}, releaseInterface: async () => {}, open: async () => {}, transferIn: async () => ({}), transferOut: async () => ({}), close: async () => { devices.find(d => d.serial === serial).closes++ } },
    async connect() { this.connects++; await this.raw.open(); return { serial } },
  }))
  const clients = [], authentications = []
  const api = load('src/main/lib/devices/android.ts', {
    './androidServer': { connectLocalAdb: localAdb },
    './androidOverview': { readAndroidOverview: async adb => ({ name: adb.serial }) },
    'node:fs/promises': filesystem,
    '@yume-chan/adb': {
      AdbDaemonTransport: { authenticate: async options => { authentications.push(options.serial); return { serial: options.serial } } },
      Adb: class { constructor(transport) { this.serial = transport.serial } async close() {} },
    },
    '@yume-chan/adb-daemon-webusb': { AdbDaemonWebUsbDeviceManager: class { async getDevices() { return devices } } },
    '@yume-chan/adb-scrcpy': {
      AdbScrcpyOptions3_3_3: class { constructor(value) { this.value = value } },
      AdbScrcpyClient: {
        async pushServer(_adb, stream) { const reader = stream.getReader(); assert.equal((await reader.read()).value.toString(), 'source-built-server-fixture') },
        async start(adb, _path, options) {
          assert.equal(options.value.videoCodec, 'h264'); assert.equal(options.value.audio, false)
          const client = { serial: adb.serial, calls: [], closed: false,
            output: { pipeTo: async () => {} }, videoStream: Promise.resolve({ width: 1000, height: 2000,
              metadata: {}, stream: { async *[Symbol.asyncIterator]() { yield { type: 'configuration', data: config }; yield { type: 'data', data: key, keyframe: true, pts: 10n } } } }),
            controller: { injectTouch: async input => client.calls.push(input), injectKeyCode: async input => client.calls.push(input), setClipboard: async input => client.calls.push(input) },
            async close() { this.closed = true },
          }; clients.push(client); return client
        },
      },
    },
    '@yume-chan/stream-extra': { ReadableStream, WritableStream },
    'node:module': { createRequire: () => () => ({ WebUSB: class {} }) },
    'share/main/lib/util': { getUserDataPath: file => path.join(directory, file), resolveResources: () => path.join(directory, 'server') },
  })
  return { ...api, devices, clients, authentications }
}
function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plus-source-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, 'server'), 'source-built-server-fixture')
  return root
}
test('USB close waits for native reads and releases claimed interfaces exactly once', async t => {
  const f = androidFixture(directory(t)), calls = []
  let finish
  const raw = { claimInterface: async number => calls.push(['claim', number]),
    open: async () => {}, transferOut: async () => ({}),
    clearHalt: async () => {},
    transferIn: (...args) => { calls.push(args); return new Promise(resolve => { finish = resolve }) },
    releaseInterface: async number => calls.push(['release', number]), close: async () => calls.push(['close']) }
  f.configureAndroidUsb(raw); f.configureAndroidUsb(raw)
  await raw.claimInterface(1)
  const read = raw.transferIn(1, 512)
  const first = raw.close(), second = raw.close()
  assert.equal(first, second)
  assert.deepEqual(calls, [['claim', 1], [1, 512, 1000]])
  finish({ status: 'ok' }); await read; await first
  assert.deepEqual(calls, [['claim', 1], [1, 512, 1000], ['release', 1], ['close']])
})
test('USB idle timeouts do not end ADB authentication and real disconnects still reject', async t => {
  const f = androidFixture(directory(t)); let reads = 0
  const raw = { claimInterface: async () => {}, releaseInterface: async () => {}, open: async () => {}, close: async () => {}, transferOut: async () => ({}),
    transferIn: async () => { if (++reads === 1) throw new Error('Cancelled'); if (reads === 2) return { status: 'ok' }; throw new Error('Device disconnected') } }
  f.configureAndroidUsb(raw)
  assert.equal((await raw.transferIn(1, 512)).status, 'ok')
  assert.equal(reads, 2)
  await assert.rejects(raw.transferIn(1, 512), /disconnected/)
  await raw.close()
})
test('direct USB discovery distinguishes identical models without authenticating or launching tools', async t => {
  const f = androidFixture(directory(t))
  const devices = await f.discoverAndroid()
  assert.deepEqual(Array.from(devices, d => d.key), ['android:a', 'android:b'])
  assert.equal(devices[0].name, devices[1].name)
  assert.ok(f.devices.every(d => d.connects === 0))
})
test('USB devices without a serial use separate physical port identities', async t => {
  const f = androidFixture(directory(t))
  f.devices[0].serial = f.devices[1].serial = '1234x5678'
  Object.assign(f.devices[0].raw, { bus: 'one', ports: [1] })
  Object.assign(f.devices[1].raw, { bus: 'one', ports: [2] })
  const devices = await f.discoverAndroid()
  assert.notEqual(devices[0].key, devices[1].key)
})
test('source Android sessions authenticate the selected serial, translate input and stop independently', async t => {
  const f = androidFixture(directory(t)), frames = []
  const a = new f.AndroidMirror({ key: 'android:a', connectionId: 'a' })
  const b = new f.AndroidMirror({ key: 'android:b', connectionId: 'b' })
  await Promise.all([a.start(frame => frames.push(frame), () => {}), b.start(() => {}, () => {})])
  await new Promise(setImmediate)
  assert.deepEqual(f.authentications.sort(), ['a', 'b'])
  await a.input({ type: 'touch', action: 'down', x: .5, y: .25 })
  assert.equal(f.clients.find(c => c.serial === 'a').calls[0].pointerX, 500)
  assert.equal(f.clients.find(c => c.serial === 'a').calls[0].pointerY, 500)
  await a.input({ type: 'text', text: '中文输入' })
  assert.equal(f.clients.find(c => c.serial === 'a').calls[1].content, '中文输入')
  await a.close()
  assert.equal(f.clients.find(c => c.serial === 'a').closed, true)
  assert.equal(f.clients.find(c => c.serial === 'b').closed, false)
  await assert.rejects(a.input({ type: 'key', keyCode: 4 }), /unavailable/)
  await b.close()
})
test('ADB credentials persist one private identity and use restrictive file permissions', async t => {
  const root = directory(t), f = androidFixture(root), file = path.join(root, 'identity/key')
  const store = new f.FileAdbCredentials(file)
  const [a, b] = await Promise.all([store.generateKey(), store.generateKey()])
  assert.deepEqual(Buffer.from(a.buffer), Buffer.from(b.buffer))
  const saved = []; for await (const key of new f.FileAdbCredentials(file).iterateKeys()) saved.push(key)
  assert.deepEqual(Buffer.from(saved[0].buffer), Buffer.from(a.buffer))
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600)
})
test('a failed provider preserves devices from other protocols and exposes the receiver as an entry only', async () => {
  const { getDevices, startSelected } = load('src/main/lib/devices/index.ts', {
    electron: { app: {} }, 'share/main/lib/util': {},
    '../hdc': { getTargets: async () => { throw new Error('HDC unavailable') } },
    './android': { discoverAndroid: async () => [{ key: 'android:a', name: 'Phone', platform: 'android', state: 'ready' }] },
    './ios-usbmux': { discoverIos: async () => { throw new Error('usbmux unavailable') } },
    '../../window/nativeMirror': { nativeMirrors: { list: () => [] } },
    '../../window/screencast': { listSessions: () => [] },
  })
  const one = getDevices(), two = getDevices(); assert.equal(one, two)
  const result = await one
  assert.deepEqual(Array.from(result.errors), ['harmony', 'ios'])
  assert.equal(result.targets.length, 2)
  assert.equal(result.targets[1].transport, 'receiver')
  await assert.rejects(startSelected('unknown'), /Refresh devices/)
})

test('queued gestures each retain their own touch release', async t => {
  const f = androidFixture(directory(t)), mirror = new f.AndroidMirror({ key: 'android:a', connectionId: 'a' })
  await mirror.start(() => {}, () => {}); await new Promise(setImmediate)
  try {
    await Promise.all(['down', 'up', 'down', 'up'].map(action => mirror.input({ type: 'touch', action, x: .5, y: .5 })))
    assert.deepEqual(f.clients[0].calls.map(message => message.action), [0, 1, 0, 1])
  } finally { await mirror.close() }
})
test('a simultaneous first authorization cannot read a partially written host key', async t => {
  const root = directory(t), file = path.join(root, 'identity/key')
  let release, started
  const paused = new Promise(resolve => { release = resolve })
  const opened = new Promise(resolve => { started = resolve })
  let first = true
  const f = androidFixture(root, { ...fs.promises, async writeFile(name, data, options) {
    if (!first) return fs.promises.writeFile(name, data, options)
    first = false
    const handle = await fs.promises.open(name, options.flag, options.mode)
    started()
    try { await paused; await handle.writeFile(data) } finally { await handle.close() }
  } })
  const store = new f.FileAdbCredentials(file), initial = store.generateKey()
  await opened
  let second
  try {
    second = await store.generateKey()
    assert.ok(second.buffer.length > 0, 'another authorization must only see a complete key')
    require('node:crypto').createPrivateKey({ key: Buffer.from(second.buffer), format: 'der', type: 'pkcs8' })
  } finally { release(); await initial }
  assert.deepEqual(Buffer.from((await initial).buffer), Buffer.from(second.buffer))
})
test('detached USB cleanup never reads descriptors and always closes the old handle',async t=>{
 const f=androidFixture(directory(t)),calls=[]
 const raw={open:async()=>{},transferIn:async()=>({}),transferOut:async()=>({}),claimInterface:async()=>{},
  releaseInterface:async number=>{calls.push(['release',number]);throw new Error('getString error: device disconnected')},
  close:async()=>{calls.push(['close'])}}
 Object.defineProperty(raw,'configuration',{get(){throw new Error('getString error: device disconnected')}})
 f.configureAndroidUsb(raw);await raw.claimInterface(3);await raw.close();await raw.close()
 assert.deepEqual(calls,[['release',3],['close']])
})
test('native handle close still runs when interface release has an unexpected failure',async t=>{
 const f=androidFixture(directory(t));let closed=0
 const raw={open:async()=>{},transferIn:async()=>({}),transferOut:async()=>({}),claimInterface:async()=>{},
  releaseInterface:async()=>{throw new Error('unexpected release failure')},close:async()=>{closed++}}
 f.configureAndroidUsb(raw);await raw.claimInterface(1)
 await assert.rejects(raw.close(),/unexpected release failure/);assert.equal(closed,1)
})
test('failed interface claims do not authorize releasing another owner interface',async t=>{
 const f=androidFixture(directory(t));let releases=0,closed=0
 const raw={open:async()=>{},transferIn:async()=>({}),transferOut:async()=>({}),claimInterface:async()=>{throw new Error('busy')},
  releaseInterface:async()=>{releases++},close:async()=>{closed++}}
 f.configureAndroidUsb(raw);await assert.rejects(raw.claimInterface(2),/busy/);await raw.close()
 assert.equal(releases,0);assert.equal(closed,1)
})
test('libusb endpoint timeouts are bounded and idle LIBUSB timeouts retry',async t=>{
 const f=androidFixture(directory(t));let reads=0;const endpoints={129:{timeout:0},1:{timeout:0}}
 const raw={getEndpoint:address=>endpoints[address],open:async()=>{},close:async()=>{},claimInterface:async()=>{},releaseInterface:async()=>{},
  transferIn:async()=>{assert.equal(endpoints[129].timeout,1000);if(++reads===1)throw new Error('transferIn error: LIBUSB_TRANSFER_TIMED_OUT');return{status:'ok'}},
  transferOut:async()=>{assert.equal(endpoints[1].timeout,1000);return{status:'ok'}}}
 f.configureAndroidUsb(raw);assert.equal((await raw.transferIn(1,512)).status,'ok');assert.equal(reads,2);await raw.transferOut(1,new Uint8Array([1]));await raw.close()
})
test('libusb physical port identity separates devices without serial descriptors',async t=>{
 const f=androidFixture(directory(t));f.devices[0].serial=f.devices[1].serial='1234x5678'
 f.devices[0].raw.device={busNumber:1,deviceAddress:2,portNumbers:[1,2]};f.devices[1].raw.device={busNumber:1,deviceAddress:3,portNumbers:[1,3]}
 const devices=await f.discoverAndroid();assert.notEqual(devices[0].key,devices[1].key)
})
test('Android key injection attempts key-up even when key-down acknowledgement fails',async t=>{
 const f=androidFixture(directory(t));const backend=new f.AndroidMirror({key:'android:a',connectionId:'a'})
 await backend.start(()=>{},()=>{});const actions=[]
 f.clients[0].controller.injectKeyCode=async value=>{actions.push(value.action);if(value.action===0)throw Error('lost down response')}
 await assert.rejects(backend.input({type:'key',keyCode:66}),/lost down response/)
 assert.deepEqual(actions,[0,1]);await backend.close()
})
test('automation geometry is rechecked inside Android input queue while release remains possible',async t=>{
 const f=androidFixture(directory(t)),mirror=new f.AndroidMirror({key:'android:a',connectionId:'a'})
 await mirror.start(()=>{},()=>{});await new Promise(setImmediate)
 const expected={width:1000,height:2000},input={type:'touch',action:'down',x:.25,y:.5}
 await mirror.input(input,expected)
 let proceed;mirror.inputTail=new Promise(r=>proceed=r)
 const queued=mirror.input({...input,action:'move'},expected)
 mirror.width=2000;mirror.height=1000;proceed()
 await assert.rejects(queued,/geometry changed/)
 await assert.rejects(mirror.input({type:'scroll',x:.25,y:.5,dx:0,dy:1},expected),/geometry changed/)
 await mirror.input({...input,action:'up'},expected)
 assert.deepEqual(f.clients[0].calls.map(c=>c.action),[0,1]);assert.equal(f.clients[0].calls[1].videoWidth,2000)
 await mirror.close()
})
test('Android overview reuses active mirror transport and temporary reads release USB', async t => {
  const f = androidFixture(directory(t))
  const [target] = await f.discoverAndroid()
  const mirror = new f.AndroidMirror(target)
  await mirror.start(() => {}, () => {})
  assert.equal((await f.getAndroidOverview(target)).name, target.connectionId)
  assert.equal(f.devices[0].connects, 1)
  assert.equal(f.devices[0].closes, 0, 'overview must not close video transport')
  await mirror.close()
  assert.equal((await f.getAndroidOverview(target)).name, target.connectionId)
  assert.equal(f.devices[0].connects, 2)
  assert.equal(f.devices[0].closes, 2, 'standalone read must release its connection')
})
test('overview waits for a stopping mirror to release its USB interface', async t => {
  const f = androidFixture(directory(t)), [target] = await f.discoverAndroid()
  let release, closing = false
  const gate = new Promise(resolve => { release = resolve })
  f.devices[0].raw.close = async () => { closing = true; f.devices[0].closes++; await gate }
  const mirror = new f.AndroidMirror(target)
  await mirror.start(() => {}, () => {})
  const stopped = mirror.close()
  while (!closing) await new Promise(setImmediate)
  const overview = f.getAndroidOverview(target)
  await new Promise(setImmediate)
  try { assert.equal(f.devices[0].connects, 1, 'must retain USB ownership through teardown') }
  finally { release(); await stopped; await overview }
  assert.equal(f.devices[0].connects, 2)
})

test('temporary overview cleanup failure is retried before another read or mirror claims USB', async t => {
  for (const next of ['overview', 'mirror']) {
    const f = androidFixture(directory(t)), [target] = await f.discoverAndroid()
    let held = false, failed = false, opens = 0, closes = 0
    f.devices[0].raw.open = async () => { assert.equal(held, false, 'previous native owner must drain'); held = true; opens++ }
    f.devices[0].raw.close = async () => { closes++; if (!failed) { failed = true; throw Error('cleanup failed') }; held = false }
    await assert.rejects(f.getAndroidOverview(target), /cleanup failed/)
    assert.equal(held, true)
    if (next === 'overview') await f.getAndroidOverview(target)
    else {
      const mirror = new f.AndroidMirror(target)
      await mirror.start(() => {}, () => {})
      await mirror.close()
    }
    assert.equal(opens, 2); assert.equal(closes, 3); assert.equal(held, false)
  }
})

test('successful iOS discovery reconciles reconnectable windows instead of stopping them',async()=>{
  const calls=[]
  const {getDevices}=load('src/main/lib/devices/index.ts',{
    electron:{app:{}},'share/main/lib/util':{},'../hdc':{getTargets:async()=>[]},
    './android':{discoverAndroid:async()=>[]},'./ios-usbmux':{discoverIos:async()=>[]},
    '../../window/nativeMirror':{nativeMirrors:{list:()=>[{id:'ios-window',deviceKey:'ios:01234567',platform:'ios'}],reconcileIos:async targets=>calls.push(['reconcile',targets]),stop:async()=>calls.push(['stop'])}},
    '../../window/screencast':{listSessions:()=>[]}
  })
  await getDevices();assert.deepEqual(calls.map(c=>c[0]),['reconcile'])
})

test('overview IPC routes a USB iPhone to its metadata reader without invoking HDC',async()=>{
 const handlers=new Map(),calls=[]
 const phone={key:'ios:01234567',connectionId:'01234567',platform:'ios',transport:'usb',state:'ready'}
 const api=load('src/main/lib/devices/index.ts',{
   electron:{app:{on(){}}},'share/main/lib/util':{handleEvent:(name,fn)=>handlers.set(name,fn)},
   '../hdc':{getTargets:async()=>[],getOverview:async()=>{throw Error('must not use HDC')}},
   './android':{discoverAndroid:async()=>[]},'./ios-usbmux':{discoverIos:async()=>[phone],getIosOverview:async target=>{calls.push(target);return {osVersion:'iOS fixture'}}},
   '../../window/nativeMirror':{nativeMirrors:{list:()=>[],reconcileIos:async()=>{}}},
   '../../window/screencast':{listSessions:()=>[]}
 })
 api.init();await api.getDevices();assert.equal((await handlers.get('getDeviceOverview')(phone.key)).osVersion,'iOS fixture')
 assert.equal(calls[0].key,phone.key)
 await assert.rejects(handlers.get('getDeviceOverview')('ios:airplay-receiver'),/unavailable/)
})


test('Android USB access failure reuses only the exact local ADB device after closing its USB handle',async t=>{
 let selected,closed=false
 const f=androidFixture(directory(t),fs.promises,async serial=>{assert.equal(closed,true);selected=serial;return {serial,close:async()=>{}}})
 const device=f.devices[0];device.raw.serialNumber='a';device.raw.close=async()=>{closed=true}
 device.connect=async()=>{throw Error('claimInterface error: LIBUSB_ERROR_ACCESS')}
 const [target]=await f.discoverAndroid()
 assert.equal((await f.getAndroidOverview(target)).name,'a');assert.equal(selected,'a');assert.equal(f.authentications.length,0)
})
test('Android does not fall back to another transport after authentication or generic USB failure',async t=>{
 let calls=0
 const f=androidFixture(directory(t),fs.promises,async()=>{calls++;throw Error('unexpected')})
 f.devices[0].raw.serialNumber='a';f.devices[0].connect=async()=>{throw Error('disconnected')}
 const [target]=await f.discoverAndroid();await assert.rejects(f.getAndroidOverview(target),/disconnected/);assert.equal(calls,0)
})
