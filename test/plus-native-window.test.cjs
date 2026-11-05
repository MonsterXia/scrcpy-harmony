const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { transformSync } = require('esbuild')
const config = Uint8Array.from([0,0,0,1,0x67,0x42,0,0x1f,0,0,0,1,0x68,0x11])
const key = Uint8Array.from([0,0,0,1,0x65,1])
function fixture() {
  const handlers = new Map(), windows = [], backends = []
  class Android {
    constructor(target) { this.target = target; this.closed = false; this.inputs = []; backends.push(this) }
    async start(frame, state) { this.frame = frame; this.state = state; state('connected') }
    async close() { this.closed = true; this.finish?.() }
    async input(input) { this.inputs.push(input) }
  }
  class Ios extends Android {}
  function load(file, mocks) {
    const module = { exports: {} }
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
      { module, exports: module.exports, console,
        require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id) })
    return module.exports
  }
  const api = load('src/main/window/nativeMirror.ts', {
    electron: { ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) } },
    'share/main/lib/window': {
      create() {
        const window = new EventEmitter(); window.webContents = new EventEmitter(); window.webContents.mainFrame = {}
        window.frames = []; window.webContents.send = (...args) => window.frames.push(args)
        window.isDestroyed = () => window.destroyed === true
        window.destroy = () => { if (!window.destroyed) { window.destroyed = true; window.emit('closed') } }
        window.focus = () => { window.focused = true }; windows.push(window); return window
      },
      loadPage(window) { window.webContents.emit('did-navigate') }, getWin() {},
    },
    '../lib/devices/android': { AndroidMirror: Android },
    '../lib/devices/airplay': { AirplayMirror: Ios },
    '../lib/devices/media': load('src/main/lib/devices/media.ts', {}),
  })
  const invoke = (name, window, ...args) => Promise.resolve().then(() => handlers.get(name)({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, ...args))
  return { ...api, handlers, windows, backends, invoke, Android }
}
const target = (id = 'a') => ({ key: `android:${id}`, connectionId: id, name: 'Same model', platform: 'android' })
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
  await assert.rejects(Promise.resolve().then(() => f.handlers.get('nativeMirrorFit')({ sender: win.webContents, senderFrame: {} }, 1080, 2340, 180, 16)), /document/)
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
  await assert.rejects(Promise.resolve().then(() => f.handlers.get('nativeMirrorInput')({ sender: f.windows[0].webContents, senderFrame: {} }, { type: 'key', keyCode: 4 })), /document/)
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
