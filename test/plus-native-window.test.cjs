const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { transformSync } = require('esbuild')
const loadAutomation = require('./helpers/load-automation.cjs')
const config = Uint8Array.from([0,0,0,1,0x67,0x42,0,0x1f,0,0,0,1,0x68,0x11])
const key = Uint8Array.from([0,0,0,1,0x65,1])
function fixture(provisioning = {}, clock = Date) {
  const handlers = new Map(), windows = [], backends = []
  class Android {
    constructor(target) { this.target = target; this.closed = false; this.inputs = []; backends.push(this) }
    async start(frame, state) { this.frame = frame; this.state = state; state('connected') }
    async close() { this.closed = true; this.finish?.() }
    async input(input) { this.inputs.push(input) }
    async setVideo(enabled) { this.videoEnabled = enabled; this.state(enabled ? 'video' : 'screenshot') }
  }
  class Ios extends Android {}
  function load(file, mocks) {
    const module = { exports: {} }
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
      { module, exports: module.exports, console, AbortController, Date: clock,
        require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id) })
    return module.exports
  }
  const api = load('src/main/window/nativeMirror.ts', {
    '../lib/ios-provisioning': { setIosProvisioningBusy() {}, prepareManagedIos: async () => {}, cancelIosSetup() {}, iosSetup: async (_udid, action) => ({phase:'idle', action:action.action}), ...provisioning },
    electron: { ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) } },
    'share/main/lib/window': {
      create(options) {
        const window = new EventEmitter()
        window.options = options
        window.webContents = Object.assign(new EventEmitter(), { mainFrame: {} })
        const contents = Object.assign(new EventEmitter(), { mainFrame: {} })
        window.mirrorView = { webContents: contents }
        window.frames = []; contents.send = (...args) => window.frames.push(args)
        window.isDestroyed = () => window.destroyed === true
        contents.isDestroyed = window.isDestroyed
        window.destroy = () => { if (!window.destroyed) { window.destroyed = true; window.emit('closed') } }
        window.focus = () => { window.focused = true }; windows.push(window); return window
      },
      loadPage(window) { window.mirrorView.webContents.emit('did-navigate') }, getWin() {},
    },
    '../lib/devices/android': { AndroidMirror: Android },
    '../lib/devices/airplay': { AirplayMirror: Ios },
    '../lib/devices/ios': { IosMirror: class extends Android {} },
    '../lib/devices/media': load('src/main/lib/devices/media.ts', {}),
  })
  const invoke = (name, window, ...args) => Promise.resolve().then(() => {
    const sender = window.mirrorView.webContents
    return handlers.get(name)({ sender, senderFrame: sender.mainFrame }, ...args)
  })
  return { ...api, handlers, windows, backends, invoke, Android }
}
const target = (id = 'a') => ({ key: `android:${id}`, connectionId: id, name: 'Same model', platform: 'android' })
test('closing an iPhone window during backend cleanup cannot start deferred provisioning',async()=>{
 const calls=[]
 const f=fixture({iosSetup:async()=>{calls.push('prepare');return {phase:'ready'}}})
 await f.nativeMirrors.start({key:'ios:01234567',connectionId:'01234567',platform:'ios',transport:'usb',name:'iPhone'})
 const w=f.windows[0];await f.invoke('nativeMirrorOpen',w)
 let release;f.backends[0].close=()=>new Promise(r=>release=r)
 const pending=f.invoke('iosSetup',w,{action:'prepare'});await Promise.resolve()
 f.backends[0].close=async()=>{};await f.nativeMirrors.stop(f.nativeMirrors.list()[0].id)
 release();await assert.rejects(pending)
 assert.equal(w.destroyed,true);assert.deepEqual(calls,[])
})
test('discovery cannot reopen an iPhone reserved by manual setup', async () => {
  let started, finish
  const invoked = new Promise(resolve => { started = resolve })
  const f = fixture({ iosSetup: async () => {
    started()
    return new Promise(resolve => { finish = resolve })
  } })
  const phone = usbIphone('01234567')
  await f.nativeMirrors.start(phone)
  const win = f.windows[0]
  await f.invoke('nativeMirrorOpen', win)
  const pending = f.invoke('iosSetup', win, {action: 'prepare'})
  await invoked
  await f.nativeMirrors.reconcileIos([phone])
  assert.equal(f.backends.length, 1)
  assert.equal(f.backends[0].closed, true)
  await assert.rejects(f.invoke('nativeMirrorOpen', win), /setup in progress/)
  await assert.rejects(f.invoke('iosSetup', win, {action: 'prepare'}), /busy/)
  finish({phase: 'cancelled'})
  await pending
  await f.nativeMirrors.reconcileIos([phone])
  assert.equal(f.backends.length, 1)
  await f.invoke('nativeMirrorOpen', win)
  assert.equal(f.backends.length, 2)
  await f.nativeMirrors.dispose()
})
test('closing a window aborts the lifecycle signal of its active setup call',async()=>{
 let signal,finish
 const f=fixture({iosSetup:async(_udid,_action,s)=>{signal=s;return new Promise(r=>finish=r)}})
 await f.nativeMirrors.start({key:'ios:01234567',connectionId:'01234567',platform:'ios',transport:'usb',name:'iPhone'})
 const pending=f.invoke('iosSetup',f.windows[0],{action:'prepare'});await Promise.resolve()
 await f.nativeMirrors.stop(f.nativeMirrors.list()[0].id)
 finish({phase:'cancelled'});await pending
 assert.equal(signal?.aborted,true)
})
test('closing an iPhone during automatic preparation aborts its operation signal',async()=>{
 let signal,finish
 const f=fixture({prepareManagedIos:async(_udid,s)=>{signal=s;return new Promise(r=>finish=r)}})
 await f.nativeMirrors.start({key:'ios:01234567',connectionId:'01234567',platform:'ios',transport:'usb',name:'iPhone'})
 const pending=f.invoke('nativeMirrorOpen',f.windows[0]);await new Promise(setImmediate)
 const rejected=assert.rejects(pending)
 const stopping=f.nativeMirrors.stop(f.nativeMirrors.list()[0].id)
 finish();await rejected;await stopping
 assert.equal(signal?.aborted,true);assert.equal(f.backends.length,0)
})
test('closing an idle window does not issue device-wide cancellation of background work',async()=>{
 let cancelled=0
 const f=fixture({cancelIosSetup:()=>cancelled++})
 await f.nativeMirrors.start({key:'ios:01234567',connectionId:'01234567',platform:'ios',transport:'usb',name:'iPhone'})
 await f.nativeMirrors.stop(f.nativeMirrors.list()[0].id)
 assert.equal(cancelled,0)
})
for (const reason of ['gui', 'force']) test(`native ${reason} stop blocks new automation owners until cleanup finishes`, async t => {
  const f = fixture()
  const { AutomationController } = loadAutomation('src/main/automation/controller.ts')
  const controller = new AutomationController({ instanceId: 'stop-race', ipc: { handle: (key, handler) => f.handlers.set(key, handler) },
    discover: async () => ({ targets: [{ ...target(), state: 'ready' }], errors: [] }), open: (device, gui) => f.nativeMirrors.start(device, gui) })
  f.nativeMirrors.setAutomationHooks(controller.attach)
  await f.nativeMirrors.start(target())
  const win = f.windows[0]
  await f.invoke('nativeMirrorOpen', win)
  const presented = () => f.invoke('automationFrameState', win, { state: 'presented', metadata: { width: 2, height: 3, generation: 1, sequence: 1, rotation: 0, capturedAt: Date.now() } })
  await presented()
  const id = controller.sessions.list()[0].sessionId
  assert.equal(controller.sessions.get(id).state, 'running')
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  f.backends[0].close = () => pending
  const stopping = f.nativeMirrors.stop(f.nativeMirrors.list()[0].id, reason)
  t.after(async () => { finish(); await stopping; await f.nativeMirrors.dispose() })
  assert.equal(controller.sessions.get(id).state, 'stopping')
  const context = () => ({ clientId: 'new-client', deadline: Date.now() + 1000, signal: new AbortController().signal })
  await assert.rejects(controller.start(target().key, context()), { code: 'BUSY' })
  assert.throws(() => controller.sessions.claimGui(id), { code: 'UNAVAILABLE' })
  await presented()
  assert.equal(controller.sessions.get(id).state, 'stopping')
  assert.equal(controller.sessions.leases('new-client').length, 0)
  finish(); await stopping
  assert.equal(controller.sessions.get(id).state, 'stopped')
  const reopened = await controller.start(target().key, context())
  assert.notEqual(reopened.sessionId, id)
  assert.equal(controller.sessions.leases('new-client').length, 1)
  await controller.sessions.releaseLease(reopened.leaseId, context())
})
test('starting an existing failed session retries its backend without duplicating the window', async () => {
  const f = fixture(); let attempts = 0
  f.Android.prototype.start = async function(frame,state) { if (++attempts === 1) throw Error('Device disconnected'); state('connected') }
  await f.nativeMirrors.start(target())
  await assert.rejects(f.invoke('nativeMirrorOpen',f.windows[0]),/connection failed/)
  assert.equal(f.nativeMirrors.list()[0].state,'error')
  await f.nativeMirrors.start(target())
  assert.equal(f.windows.length,1);assert.equal(f.backends.length,2)
  assert.equal(f.nativeMirrors.list()[0].state,'running')
  await f.nativeMirrors.dispose()
})
test('reopening a destroyed window waits for cleanup instead of focusing a stale session', async () => {
  const f = fixture(); await f.nativeMirrors.start(target()); await f.invoke('nativeMirrorOpen', f.windows[0])
  let finish
  f.backends[0].close = () => new Promise(resolve => { finish = resolve })
  f.windows[0].destroy()
  const opening = f.nativeMirrors.start(target())
  assert.equal(f.windows.length, 1)
  f.backends[0].close = async () => {}
  finish(); await opening
  assert.equal(f.windows.length, 2)
  assert.equal(f.nativeMirrors.list().length, 1)
  assert.equal(f.windows[0].focused, undefined)
  await f.nativeMirrors.dispose()
})
test('native window fits portrait and landscape video within the display, including controls', async () => {
  const f = fixture(); await f.nativeMirrors.start(target())
  const win = f.windows[0]; let fitted, aspect
  Object.assign(win, { isMaximized: () => false, isFullScreen: () => false,
    getBounds: () => ({ x: 100, y: 100, width: 480, height: 800 }),
    getContentBounds: () => ({ width: 480, height: 772 }),
    setMinimumSize() {}, setAspectRatio: (ratio, inset) => { aspect = { ratio, inset } }, setBounds: bounds => { fitted = bounds } })
  for (const [width, height] of [[1080, 2340], [2340, 1080]]) {
    await f.invoke('nativeMirrorFit', win, width, height, 180, 16)
    assert.ok(fitted.x >= 0 && fitted.y >= 0 && fitted.x + fitted.width <= 1440 && fitted.y + fitted.height <= 900)
    assert.ok(Math.abs((fitted.width - aspect.inset.width) / (fitted.height - aspect.inset.height) - width / height) < .01)
  }
  await assert.rejects(f.invoke('nativeMirrorFit', win, 0, 2340, 180, 16), /dimensions/)
  await assert.rejects(Promise.resolve().then(() => f.handlers.get('nativeMirrorFit')({ sender: win.mirrorView.webContents, senderFrame: {} }, 1080, 2340, 180, 16)), /document/)
  await f.nativeMirrors.dispose()
})
test('native windows retain device identity and reject input or acknowledgements from other documents', async () => {
  const f = fixture(), manager = f.nativeMirrors
  await manager.start(target()); await manager.start(target('b'))
  await Promise.all(f.windows.map(win => f.invoke('nativeMirrorOpen', win)))
  assert.equal(manager.list().length, 2)
  assert.equal((await f.invoke('nativeMirrorInfo', f.windows[0])).target.key, 'android:a')
  await f.invoke('nativeMirrorInput', f.windows[0], { type: 'key', keyCode: 4 })
  assert.equal(f.backends[0].inputs.length, 1); assert.equal(f.backends[1].inputs.length, 0)
  const shell = f.windows[0].webContents
  await assert.rejects(Promise.resolve().then(() => f.handlers.get('nativeMirrorInput')({ sender: shell, senderFrame: shell.mainFrame }, { type: 'key', keyCode: 4 })), /document/)
  await assert.rejects(f.invoke('nativeMirrorInput', f.windows[0], { type: 'touch', action: 'down', x: NaN, y: .1 }), /position/)
  f.backends[0].frame({ data: config, config: true, timestamp: 0 })
  f.backends[0].frame({ data: key, timestamp: 1 }); f.backends[0].frame({ data: key, timestamp: 2 })
  const sent = () => f.windows[0].frames.filter(([name]) => name === 'nativeMirrorFrame')
  assert.equal(sent().length, 2)
  await f.invoke('nativeMirrorAck', f.windows[1], sent()[0][1].sequence)
  f.backends[0].frame({ data: key, timestamp: 3 }); assert.equal(sent().length, 2)
  await f.invoke('nativeMirrorAck', f.windows[0], sent()[0][1].sequence)
  f.backends[0].frame({ data: key, timestamp: 4 }); assert.equal(sent().length, 3)
  await manager.stop(manager.list()[0].id)
  assert.equal(f.windows[0].destroyed, true); assert.equal(f.windows[1].destroyed, undefined)
  await manager.dispose()
})
test('two iOS choices focus one receiver and expose no USB-to-AirPlay identity claim or input route', async () => {
  const f = fixture(), manager = f.nativeMirrors
  await manager.start({ ...target(), key: 'ios:a', platform: 'ios' })
  await manager.start({ ...target(), key: 'ios:b', platform: 'ios' })
  assert.equal(f.windows.length, 1); assert.equal(f.windows[0].focused, true)
  const info = await f.invoke('nativeMirrorInfo', f.windows[0])
  assert.equal(info.target.key, 'ios:airplay-receiver'); assert.equal(info.target.connectionId, undefined)
  // Do not open an iOS backend here: the stub subclasses Android for shared methods.
  await assert.rejects(f.invoke('nativeMirrorInput', f.windows[0], { type: 'key', keyCode: 4 }), /unsupported/)
  await manager.dispose()
})
test('closing during startup cancels the backend and late frames cannot reach a destroyed window', async () => {
  const f = fixture(), manager = f.nativeMirrors
  f.Android.prototype.start = function(frame) { this.frame = frame; return new Promise(resolve => { this.finish = resolve }) }
  await manager.start(target())
  const starting = f.invoke('nativeMirrorOpen', f.windows[0]); await new Promise(setImmediate)
  await manager.stop(manager.list()[0].id); await starting
  const count = f.windows[0].frames.length
  f.backends[0].frame({ data: key, timestamp: 1 })
  assert.equal(f.windows[0].frames.length, count)
  assert.equal(manager.list().length, 0)
})
test('Android and iOS application modules contain no executable-launch fallback', () => {
  for (const file of ['android.ts','airplay.ts','ios-usbmux.ts','index.ts']) {
    assert.doesNotMatch(fs.readFileSync(`src/main/lib/devices/${file}`, 'utf8'), /node:child_process|execFile\(|spawn\(/)
  }
})

test('a failed backend stop can be retried without losing the window session', async () => {
  const f = fixture(), manager = f.nativeMirrors
  await manager.start(target()); await f.invoke('nativeMirrorOpen', f.windows[0])
  let attempts = 0
  f.backends[0].close = async () => { if (++attempts === 1) throw new Error('temporary cleanup failure') }
  const id = manager.list()[0].id
  await assert.rejects(manager.stop(id), /temporary cleanup failure/)
  assert.equal(f.windows[0].destroyed, undefined)
  assert.equal(manager.list()[0].state, 'error')
  await manager.stop(id)
  assert.equal(manager.list().length, 0)
  assert.equal(f.windows[0].destroyed, true)
})

test('startup cleanup failure still publishes an error and allows a later reconnect', async () => {
  const f = fixture(), manager = f.nativeMirrors
  const start = f.Android.prototype.start, close = f.Android.prototype.close
  let starts = 0, closes = 0
  f.Android.prototype.start = async function(...args) {
    if (++starts === 1) throw new Error('connection failed')
    return start.apply(this, args)
  }
  f.Android.prototype.close = async function() {
    if (++closes === 1) throw new Error('cleanup failed')
    return close.call(this)
  }
  await manager.start(target())
  await assert.rejects(f.invoke('nativeMirrorOpen', f.windows[0]), /connection failed/i)
  assert.equal(manager.list()[0].state, 'error')
  await f.invoke('nativeMirrorOpen', f.windows[0])
  assert.equal(manager.list()[0].state, 'running')
  await manager.dispose()
})
test('automation attachment shares the native window and can retain it on GUI close',async()=>{
 const f=fixture();const events=[];let attachment
 f.nativeMirrors.setAutomationHooks(value=>{attachment=value;return {state:s=>events.push(s),closed:()=>events.push('closed'),closeRequested:()=>true,guiOpened:show=>events.push(show===false?'claim-only':'gui'),input:(_phase,operation)=>{events.push('input');return operation()}}})
 await f.nativeMirrors.start(target(),false)
 assert.equal(attachment.gui,false);assert.equal(attachment.target.key,'android:a')
 await f.invoke('nativeMirrorOpen',f.windows[0]);assert.ok(events.includes('connected'))
 await f.invoke('nativeMirrorInput',f.windows[0],{type:'key',keyCode:4});assert.ok(events.includes('input'))
 let prevented=false;f.windows[0].emit('close',{preventDefault(){prevented=true}});assert.equal(prevented,true)
 f.nativeMirrors.getSources()[0].claimGui();assert.ok(events.includes('claim-only'))
 await f.nativeMirrors.start(target());assert.ok(events.includes('gui'));assert.equal(f.windows.length,1)
 await attachment.close();assert.ok(events.includes('closed'))
})

test('USB claim failure exposes a safe actionable issue and clears it on retry', async () => {
  const f = fixture(); let attempts = 0
  f.Android.prototype.start = async function(frame, state) {
    if (++attempts === 1) throw new Error('claimInterface error: Error: LIBUSB_ERROR_ACCESS private detail')
    state('connected')
  }
  await f.nativeMirrors.start(target())
  await assert.rejects(f.invoke('nativeMirrorOpen', f.windows[0]), /connection failed/)
  const info = await f.invoke('nativeMirrorInfo', f.windows[0])
  assert.equal(info.connectionIssue, 'usb-access')
  const reported = f.windows[0].frames.filter(([name]) => name === 'nativeMirrorState').at(-1)[1]
  assert.equal(reported.connectionIssue, 'usb-access')
  assert.ok(!JSON.stringify(reported).includes('private detail'))
  await f.nativeMirrors.start(target())
  assert.equal(f.nativeMirrors.list()[0].state, 'running')
  assert.equal((await f.invoke('nativeMirrorInfo', f.windows[0])).connectionIssue, undefined)
  await f.nativeMirrors.dispose()
})

test('only Android USB access or busy failures receive the USB issue classification', async () => {
  for (const [platform, message, issue] of [
    ['android', 'LIBUSB_ERROR_BUSY', 'usb-access'],
    ['android', 'Android connection timed out', undefined],
    ['ios', 'LIBUSB_ERROR_ACCESS', undefined],
  ]) {
    const f = fixture()
    f.Android.prototype.start = async () => { throw new Error(message) }
    await f.nativeMirrors.start({ ...target(), platform })
    await assert.rejects(f.invoke('nativeMirrorOpen', f.windows[0]))
    assert.equal((await f.invoke('nativeMirrorInfo', f.windows[0])).connectionIssue, issue)
    await f.nativeMirrors.dispose()
  }
})

test('USB iPhones keep separate identities and PNG frames reach only their own window', async () => {
  const f = fixture(), manager = f.nativeMirrors
  for (const id of ['01234567','abcdefab']) await manager.start({ key: `ios:${id}`, connectionId: id, name: 'iPhone', platform: 'ios', transport: 'usb' })
  assert.equal(f.windows.length, 2)
  await f.invoke('nativeMirrorOpen', f.windows[0])
  const info = await f.invoke('nativeMirrorInfo', f.windows[0])
  assert.equal(info.target.connectionId, '01234567')
  assert.equal(info.target.transport, 'usb')
  f.backends[0].frame({ format: 'png', data: Uint8Array.from([137,80,78,71]), timestamp: 1, rotation: 0 })
  assert.equal(f.windows[0].frames.filter(([name]) => name === 'nativeMirrorFrame').length, 1)
  assert.equal(f.windows[1].frames.filter(([name]) => name === 'nativeMirrorFrame').length, 0)
  await f.invoke('nativeMirrorInput', f.windows[0], { type: 'touch', action: 'cancel', x: .5, y: .5 })
  assert.equal(f.backends[0].inputs.length, 1)
  await manager.dispose()
})

test('explicit reconnect replaces a running backend after cleanup and validates its flag', async () => {
  const f=fixture();await f.nativeMirrors.start(target());const win=f.windows[0]
  await f.invoke('nativeMirrorOpen',win)
  await assert.rejects(f.invoke('nativeMirrorOpen',win,'yes'),/Invalid reconnect/)
  assert.equal(f.backends.length,1)
  let finish;f.backends[0].close=()=>new Promise(resolve=>{finish=resolve})
  const restarting=f.invoke('nativeMirrorOpen',win,true)
  await new Promise(setImmediate)
  assert.equal(f.nativeMirrors.list()[0].state,'disconnected');assert.equal(f.backends.length,1)
  finish();await restarting
  assert.equal(f.backends.length,2);assert.equal(f.windows.length,1)
  assert.equal(f.nativeMirrors.list()[0].state,'running')
  await f.nativeMirrors.dispose()
})

const usbIphone = id => ({key:`ios:${id}`,connectionId:id,name:'iPhone',platform:'ios',transport:'usb',state:'ready'})
test('USB iPhone removal preserves its window and reappearance creates a fresh backend',async()=>{
  const f=fixture(),phone=usbIphone('01234567');await f.nativeMirrors.start(phone);const win=f.windows[0]
  await f.invoke('nativeMirrorOpen',win)
  await f.nativeMirrors.reconcileIos([])
  assert.equal(win.destroyed,undefined);assert.equal(f.nativeMirrors.list()[0].state,'disconnected');assert.equal(f.backends[0].closed,true)
  await f.nativeMirrors.reconcileIos([usbIphone('87654321')]);assert.equal(f.backends.length,1)
  await Promise.all([f.nativeMirrors.reconcileIos([phone]),f.nativeMirrors.reconcileIos([phone])])
  assert.equal(f.backends.length,2);assert.equal(f.windows.length,1);assert.equal(f.nativeMirrors.list()[0].state,'running')
  await f.nativeMirrors.dispose()
})
test('USB reappearance retains a failed cleanup and retries after the owned resources are confirmed gone',async()=>{
  const f=fixture(),phone=usbIphone('01234567');await f.nativeMirrors.start(phone);const win=f.windows[0]
  await f.invoke('nativeMirrorOpen',win);let offline=true
  f.backends[0].close=async()=>{if(offline)throw Error('USB absent')}
  await f.nativeMirrors.reconcileIos([]);await f.nativeMirrors.reconcileIos([phone]);assert.equal(f.backends.length,1)
  offline=false;await f.nativeMirrors.reconcileIos([phone]);assert.equal(f.backends.length,2)
  assert.equal(f.nativeMirrors.list()[0].state,'running');await f.nativeMirrors.dispose()
})

test('USB recovery restores a previously active video only after the fresh backend starts',async()=>{
 const f=fixture(),phone=usbIphone('01234567');await f.nativeMirrors.start(phone);const win=f.windows[0]
 await f.invoke('nativeMirrorOpen',win);await f.invoke('nativeMirrorVideo',win,true)
 await f.nativeMirrors.reconcileIos([]);await f.nativeMirrors.reconcileIos([phone])
 assert.equal(f.backends[1].videoEnabled,true);assert.equal(f.nativeMirrors.list()[0].videoMode,'video')
 await f.nativeMirrors.dispose()
})
test('closing a USB window while absent prevents discovery from resurrecting it',async()=>{
 const f=fixture(),phone=usbIphone('01234567');await f.nativeMirrors.start(phone);await f.invoke('nativeMirrorOpen',f.windows[0])
 await f.nativeMirrors.reconcileIos([]);await f.nativeMirrors.stop(f.nativeMirrors.list()[0].id)
 await f.nativeMirrors.reconcileIos([phone]);assert.equal(f.backends.length,1);assert.equal(f.nativeMirrors.list().length,0)
 await f.nativeMirrors.dispose()
})

test('USB iPhone opens video by default through the shared queue and does not start it twice',async()=>{
 const f=fixture();let queued=0
 f.nativeMirrors.setAutomationHooks(()=>({state(){},closed(){},input:async(phase,run)=>{queued++;return run()}}))
 await f.nativeMirrors.start(usbIphone('01234567'));const win=f.windows[0]
 await f.invoke('nativeMirrorOpen',win);await f.invoke('nativeMirrorOpen',win)
 assert.equal(f.backends[0].videoEnabled,true);assert.equal(queued,1)
 assert.equal(f.nativeMirrors.list()[0].videoMode,'video')
 await f.nativeMirrors.dispose()
})
test('a successful screenshot fallback keeps the iPhone connected when default video fails',async()=>{
 const f=fixture()
 f.Android.prototype.setVideo=async function(){this.state('video-error');throw Error('broadcast timeout')}
 await f.nativeMirrors.start(usbIphone('01234567'));await f.invoke('nativeMirrorOpen',f.windows[0])
 assert.equal(f.nativeMirrors.list()[0].state,'running');assert.equal(f.nativeMirrors.list()[0].videoMode,'video-error')
 assert.equal(f.backends[0].closed,false);await f.nativeMirrors.dispose()
})
test('failed default video cleanup remains a connection failure instead of claiming a screenshot fallback',async()=>{
 const f=fixture()
 f.Android.prototype.setVideo=async function(){this.state('video-starting');throw Error('cleanup failed')}
 await f.nativeMirrors.start(usbIphone('01234567'))
 await assert.rejects(f.invoke('nativeMirrorOpen',f.windows[0]),/connection failed/)
 assert.equal(f.nativeMirrors.list()[0].state,'error');await f.nativeMirrors.dispose()
})
test('manual screenshot choice survives USB and explicit reconnect; a new window defaults to video',async()=>{
 const f=fixture(),phone=usbIphone('01234567');await f.nativeMirrors.start(phone);const win=f.windows[0]
 await f.invoke('nativeMirrorOpen',win);await f.invoke('nativeMirrorVideo',win,false)
 await f.nativeMirrors.reconcileIos([]);await f.nativeMirrors.reconcileIos([phone])
 assert.equal(f.nativeMirrors.list()[0].videoMode,'screenshot');assert.notEqual(f.backends[1].videoEnabled,true)
 await f.invoke('nativeMirrorOpen',win,true)
 assert.equal(f.nativeMirrors.list()[0].videoMode,'screenshot')
 await f.nativeMirrors.stop(f.nativeMirrors.list()[0].id)
 await f.nativeMirrors.start(phone);await f.invoke('nativeMirrorOpen',f.windows[1])
 assert.equal(f.nativeMirrors.list()[0].videoMode,'video');await f.nativeMirrors.dispose()
})

test('WDA recovery reconnects a previously running iPhone without a USB removal event',async()=>{
 const f=fixture(),phone=usbIphone('01234567');await f.nativeMirrors.start(phone);const win=f.windows[0]
 await f.invoke('nativeMirrorOpen',win);f.backends[0].state('disconnected')
 let offline=true;f.backends[0].close=async()=>{if(offline)throw Error('write EPIPE')}
 await f.nativeMirrors.reconcileIos([phone]);assert.equal(f.backends.length,1)
 offline=false;await Promise.all([f.nativeMirrors.reconcileIos([phone]),f.nativeMirrors.reconcileIos([phone])])
 assert.equal(f.backends.length,2);assert.equal(f.nativeMirrors.list()[0].state,'running');assert.equal(f.nativeMirrors.list()[0].videoMode,'video')
 await f.nativeMirrors.dispose()
})
test('an initial WDA failure does not repeatedly allocate sessions on device discovery',async()=>{
 const f=fixture(),phone=usbIphone('01234567');f.Android.prototype.start=async()=>{throw Error('WDA busy')}
 await f.nativeMirrors.start(phone);await assert.rejects(f.invoke('nativeMirrorOpen',f.windows[0]))
 await f.nativeMirrors.reconcileIos([phone]);assert.equal(f.backends.length,1);await f.nativeMirrors.dispose()
})

test('unknown allocation cleanup retains the backend and exposes recovery instructions',async()=>{
 const f=fixture();let released=false
 f.Android.prototype.start=async()=>{throw Error('allocation response lost')}
 f.Android.prototype.close=async()=>{if(!released)throw Object.assign(Error('unknown'),{code:'IOS_WDA_ALLOCATION_UNKNOWN'})}
 await f.nativeMirrors.start(usbIphone('01234567'));await assert.rejects(f.invoke('nativeMirrorOpen',f.windows[0]))
 assert.equal(f.nativeMirrors.list()[0].connectionIssue,'ios-cleanup-unknown')
 await assert.rejects(f.invoke('nativeMirrorOpen',f.windows[0]));assert.equal(f.backends.length,1)
 released=true;await f.nativeMirrors.dispose()
})
test('manual video unknown allocation becomes an explicit error instead of screenshot fallback',async()=>{
 const f=fixture();await f.nativeMirrors.start(usbIphone('01234567'));const win=f.windows[0]
 await f.invoke('nativeMirrorOpen',win);await f.invoke('nativeMirrorVideo',win,false)
 f.backends[0].setVideo=async()=>{throw Object.assign(Error('unknown'),{code:'IOS_WDA_ALLOCATION_UNKNOWN'})}
 await assert.rejects(f.invoke('nativeMirrorVideo',win,true))
 assert.equal(f.nativeMirrors.list()[0].state,'error');assert.equal(f.nativeMirrors.list()[0].connectionIssue,'ios-cleanup-unknown')
 await f.nativeMirrors.dispose()
})

 test('iOS setup IPC is bound to the owning USB window and rejects other frames',async()=>{
 const f=fixture();await f.nativeMirrors.start({key:'ios:01234567',connectionId:'01234567',platform:'ios',transport:'usb',name:'Phone'})
 const w=f.windows[0];assert.equal((await f.invoke('iosSetup',w,{action:'status'})).phase,'idle')
 await assert.rejects(Promise.resolve().then(()=>f.handlers.get('iosSetup')({sender:w.mirrorView.webContents,senderFrame:{}},{action:'login',email:'test@example.com',password:'test'})))
 await f.nativeMirrors.start(target());await assert.rejects(f.invoke('iosSetup',f.windows[1],{action:'status'}))
 await f.nativeMirrors.dispose()
})

test('native video windows enable web security for Chromium WebCodecs', async () => {
  const f = fixture()
  await f.nativeMirrors.start(target())
  assert.equal(f.windows[0].options.webSecurity, true)
})

test('a wedged managed iPhone runner is recovered in the same window before retrying cleanup', async () => {
  let recovered = false, calls = 0
  const f = fixture({ recoverManagedIos: async (udid, signal) => {
    assert.equal(udid, '01234567')
    assert.equal(signal.aborted, false)
    recovered = true
    calls++
  } })
  const phone = { key: 'ios:01234567', connectionId: '01234567', platform: 'ios', transport: 'usb', state: 'ready' }
  await f.nativeMirrors.start(phone)
  await f.invoke('nativeMirrorOpen', f.windows[0])
  f.backends[0].close = async () => { if (!recovered) throw Error('status timed out') }
  f.backends[0].state('disconnected')
  await Promise.all([f.nativeMirrors.reconcileIos([phone]), f.nativeMirrors.reconcileIos([phone])])
  assert.equal(calls, 1)
  assert.equal(f.windows.length, 1)
  assert.equal(f.backends.length, 2)
  assert.equal(f.nativeMirrors.list()[0].state, 'running')
  assert.equal(f.backends[1].videoEnabled, true)
})

test('ReplayKit retries a confirmed preview fallback after reconnect, and honors the user choosing screenshots', async () => {
  let now = 1000, starts = 0
  const f = fixture({}, {now: () => now}), phone = usbIphone('01234567')
  f.Android.prototype.setVideo = async function(enabled) {
    if (enabled && ++starts === 2) { this.state('video-error'); throw Error('extension not ready') }
    this.state(enabled ? 'video' : 'screenshot')
  }
  await f.nativeMirrors.start(phone)
  const win = f.windows[0]
  await f.invoke('nativeMirrorOpen', win)
  f.backends[0].state('disconnected')
  await f.nativeMirrors.reconcileIos([phone])
  assert.equal(f.nativeMirrors.list()[0].videoMode, 'video-error')
  await f.nativeMirrors.reconcileIos([phone])
  assert.equal(starts, 2)
  now += 6000
  await Promise.all([f.nativeMirrors.reconcileIos([phone]), f.nativeMirrors.reconcileIos([phone])])
  assert.equal(starts, 3)
  assert.equal(f.nativeMirrors.list()[0].videoMode, 'video')
  await f.invoke('nativeMirrorVideo', win, false, 'decode-error')
  now += 6000
  await f.nativeMirrors.reconcileIos([phone])
  assert.equal(starts, 4)
  await f.invoke('nativeMirrorVideo', win, false)
  now += 6000
  await f.nativeMirrors.reconcileIos([phone])
  assert.equal(starts, 4)
  await f.nativeMirrors.dispose()
})

test('unplugging during a ReplayKit retry closes that backend before reconnecting the same iPhone', async () => {
  let now = 1000
  const f = fixture({}, { now: () => now }), phone = usbIphone('01234567')
  await f.nativeMirrors.start(phone)
  await f.invoke('nativeMirrorOpen', f.windows[0])
  f.backends[0].state('disconnected')
  await f.nativeMirrors.reconcileIos([phone])
  const backend = f.backends[1]
  backend.state('video-error')
  now += 6000
  let finishVideo, finishClose
  backend.setVideo = () => new Promise(resolve => { finishVideo = resolve })
  backend.close = () => new Promise(resolve => { finishClose = resolve })
  const retry = f.nativeMirrors.reconcileIos([phone])
  const unplugged = f.nativeMirrors.reconcileIos([])
  assert.equal(typeof finishClose, 'function')
  assert.equal(f.nativeMirrors.list()[0].state, 'disconnected')
  finishVideo()
  await retry
  const reappeared = f.nativeMirrors.reconcileIos([phone])
  assert.equal(f.backends.length, 2)
  backend.close = async () => {}
  finishClose()
  await Promise.all([unplugged, reappeared])
  await f.nativeMirrors.reconcileIos([phone])
  assert.equal(f.backends.length, 3)
  assert.equal(f.nativeMirrors.list()[0].state, 'running')
  await f.nativeMirrors.dispose()
})
