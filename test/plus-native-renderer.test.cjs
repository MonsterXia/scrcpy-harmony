const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup(), { act } = React
async function fixture(t, platform = 'android') {
  const listeners = new Map(), inputs = [], acks = [], decoded = [], outputs = [], fits = []
  const main = {
    on: (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name) },
    nativeMirrorInfo: async () => ({ id: 'owned-session', target: { platform, name: 'Phone' }, state: 'starting' }),
    nativeMirrorOpen: async () => {}, nativeMirrorInput: async input => inputs.push(input),
    nativeMirrorAck: async sequence => acks.push(sequence),
    nativeMirrorFit: async (...args) => fits.push(args),
  }
  const App = load('src/renderer/native-mirror/App.tsx', {
    'common/util': { t: key => key },
    '../screencast/lib/H264Decoder': class { constructor(output) { outputs.push(output) } push(...args) { decoded.push(args) } destroy() {} },
  }, { main, preload: { setTitle() {} } }).default
  const host = document.body.appendChild(document.createElement('div')), root = createRoot(host)
  await act(async () => root.render(React.createElement(App)))
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  await act(async () => listeners.get('nativeMirrorState')({ id: 'owned-session', state: 'running' }))
  return { host, listeners, inputs, acks, decoded, outputs, fits }
}
test('decoded dimensions fit the window once and again on screen rotation', async t => {
  const f = await fixture(t), canvas = f.host.querySelector('canvas')
  canvas.getBoundingClientRect = () => ({ width: window.innerWidth - 16, height: window.innerHeight - 180 })
  canvas.getContext = () => ({ drawImage() {} })
  await act(async () => f.listeners.get('nativeMirrorFrame')({ sessionId: 'owned-session', sequence: 1, timestamp: 0, data: new Uint8Array([1]) }))
  let closed = 0
  for (const [displayWidth, displayHeight] of [[1080, 2340], [1080, 2340], [2340, 1080]]) {
    await act(async () => f.outputs[0]({ displayWidth, displayHeight, close() { closed++ } }))
  }
  assert.deepEqual(f.fits, [[1080, 2340, 180, 16], [2340, 1080, 180, 16]])
  assert.equal(closed, 3)
})
function pointer(canvas, type, x, y, pointerId = 1) {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { clientX: x, clientY: y, pointerId, isPrimary: pointerId === 1, button: 0 })
  canvas.dispatchEvent(event)
}
test('native Android canvas maps content coordinates and ignores another pointer during a drag', async t => {
  const f = await fixture(t), canvas = f.host.querySelector('canvas')
  canvas.setPointerCapture = () => {}
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 200 })
  await act(async () => pointer(canvas, 'pointerdown', 50, 100))
  assert.equal(f.inputs[0].action, 'down')
  assert.ok(Math.abs(f.inputs[0].x - .5) < 1e-6)
  assert.ok(Math.abs(f.inputs[0].y - .5) < 1e-6)
  await act(async () => pointer(canvas, 'pointermove', 10, 10, 2))
  assert.equal(f.inputs.length, 1)
  await act(async () => pointer(canvas, 'pointerup', 150, 300))
  assert.equal(f.inputs[1].action, 'up'); assert.equal(f.inputs[1].x, 1); assert.equal(f.inputs[1].y, 1)
})
test('only owned frames are decoded and acknowledged', async t => {
  const f = await fixture(t)
  const packet = { sessionId: 'other-session', sequence: 1, timestamp: 1, data: new Uint8Array([1]), keyFrame: true }
  await act(async () => f.listeners.get('nativeMirrorFrame')(packet))
  assert.equal(f.decoded.length, 0); assert.equal(f.acks.length, 0)
  await act(async () => f.listeners.get('nativeMirrorFrame')({ ...packet, sessionId: 'owned-session' }))
  assert.equal(f.decoded.length, 1); assert.deepEqual(f.acks, [1])
})
test('iOS screen exposes no Android controls or input form', async t => {
  const f = await fixture(t, 'ios')
  assert.equal(f.host.querySelector('form'), null)
  assert.equal(f.host.querySelector('canvas').tabIndex, -1)
  await act(async () => pointer(f.host.querySelector('canvas'), 'pointerdown', 50, 100))
  assert.equal(f.inputs.length, 0)
})
