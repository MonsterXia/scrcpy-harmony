const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup(), { act } = React
async function fixture(t, platform = 'android', transport, extraGlobals = {}, initialSession) {
  const listeners = new Map(), inputs = [], acks = [], decoded = [], outputs = [], fits = []
  const frameStates = [], decoderErrors = [], videos = []
  const main = {
    automationFrameState: async state => frameStates.push(state),
    automationFrameResult: async () => {},
    on: (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name) },
    nativeMirrorInfo: async () => ({ id: 'owned-session', target: { platform, transport, name: 'Phone' }, state: 'starting', ...initialSession }),
    nativeMirrorOpen: async () => {}, nativeMirrorVideo: async (...args) => videos.push(args), nativeMirrorInput: async input => inputs.push(input),
    nativeMirrorAck: async sequence => acks.push(sequence),
    nativeMirrorFit: async (...args) => fits.push(args),
  }
  const App = load('src/renderer/native-mirror/App.tsx', {
    'common/util': { t: key => key },
    'share/renderer/components/ToolbarIcon': load('src/share/renderer/components/ToolbarIcon.tsx').default,
    'luna-toolbar/react': {
      __esModule: true,
      default: ({ children }) => React.createElement('div', null, children),
      LunaToolbarSpace: () => null,
    },
    '../screencast/lib/H264Decoder': class { constructor(output, error) { outputs.push(output); decoderErrors.push(error) } push(...args) { decoded.push(args) } destroy() {} },
  }, { main, preload: { setTitle() {} }, ...extraGlobals }).default
  const host = document.body.appendChild(document.createElement('div')), root = createRoot(host)
  await act(async () => root.render(React.createElement(App)))
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  if (!initialSession) await act(async () => listeners.get('nativeMirrorState')({ id: 'owned-session', state: 'running' }))
  return { host, listeners, inputs, acks, decoded, outputs, fits, frameStates, decoderErrors, videos, main }
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
  assert.deepEqual(f.frameStates.filter(s=>s.state==='presented').map(s=>[s.metadata.width,s.metadata.height]),[[1080,2340],[2340,1080]])
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
  assert.deepEqual(f.inputs.slice(1).map(input => [input.action, input.x, input.y]), [['move', 1, 1], ['up', 1, 1]])
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

test('USB iOS accepts taps but pointer cancellation sends cancel rather than committing the gesture', async t => {
  const f = await fixture(t, 'ios', 'usb'), canvas = f.host.querySelector('canvas')
  canvas.setPointerCapture = () => {}
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 200 })
  await act(async () => pointer(canvas, 'pointerdown', 50, 100))
  assert.equal(f.inputs.length, 0)
  await act(async () => pointer(canvas, 'pointercancel', 50, 100))
  f.inputs.length = 0
  canvas.getContext = () => ({ drawImage() {} })
  await act(async () => f.listeners.get('nativeMirrorFrame')({ sessionId:'owned-session',sequence:1,timestamp:0,data:new Uint8Array([1]),rotation:0 }))
  await act(async () => f.outputs[0]({displayWidth:390,displayHeight:844,close(){}}))
  await act(async () => pointer(canvas, 'pointerdown', 50, 100))
  assert.equal(f.inputs[0]?.action, 'down')
  assert.deepEqual(JSON.parse(JSON.stringify(f.inputs[0].display)), {width:390,height:844,rotation:0})
  await act(async () => pointer(canvas, 'pointercancel', 50, 100))
  assert.equal(f.inputs[1].action, 'cancel')
})

test('USB iOS video decoder failure requests screenshot fallback', async t => {
  const f=await fixture(t,'ios','usb')
  await act(async()=>f.listeners.get('nativeMirrorFrame')({sessionId:'owned-session',sequence:1,timestamp:0,data:new Uint8Array([1])}))
  await act(async()=>f.decoderErrors[0](Error('unsupported video')))
  assert.deepEqual(f.videos, [[false, 'decode-error']])
})

test('USB iOS always releases a GUI gesture when display metadata disappears mid-gesture', async t => {
  const f=await fixture(t,'ios','usb'),canvas=f.host.querySelector('canvas')
  canvas.setPointerCapture=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:200});canvas.getContext=()=>({drawImage(){}})
  await act(async()=>f.listeners.get('nativeMirrorFrame')({sessionId:'owned-session',sequence:1,timestamp:0,data:new Uint8Array([1])}))
  await act(async()=>f.outputs[0]({displayWidth:390,displayHeight:844,close(){}}))
  await act(async()=>pointer(canvas,'pointerdown',50,100))
  await act(async()=>f.decoderErrors[0](Error('lost geometry')))
  await act(async()=>pointer(canvas,'pointerup',50,100))
  assert.deepEqual(f.inputs.map(i=>i.action),['down','up'])
})

test('automatic USB recovery clears failed GUI input and accepts a fresh gesture',async t=>{
  const f=await fixture(t,'ios','usb'),canvas=f.host.querySelector('canvas')
  canvas.setPointerCapture=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:200});canvas.getContext=()=>({drawImage(){}})
  await act(async()=>f.listeners.get('nativeMirrorFrame')({sessionId:'owned-session',sequence:1,timestamp:0,data:new Uint8Array([1])}))
  await act(async()=>f.outputs[0]({displayWidth:390,displayHeight:844,close(){}}))
  const original=f.main.nativeMirrorInput;f.main.nativeMirrorInput=async()=>{throw Error('USB lost')}
  await act(async()=>pointer(canvas,'pointerdown',50,100))
  assert.match(f.host.textContent,/plusNativeInputError/)
  await act(async()=>f.listeners.get('nativeMirrorState')({id:'owned-session',state:'disconnected'}))
  assert.doesNotMatch(f.host.textContent,/plusNativeInputError/)
  f.main.nativeMirrorInput=original
  for(const state of ['starting','running']) await act(async()=>f.listeners.get('nativeMirrorState')({id:'owned-session',state}))
  await act(async()=>f.listeners.get('nativeMirrorFrame')({sessionId:'owned-session',sequence:2,timestamp:1,data:new Uint8Array([1])}))
  await act(async()=>f.outputs.at(-1)({displayWidth:390,displayHeight:844,close(){}}))
  await act(async()=>pointer(canvas,'pointerdown',50,100));await act(async()=>pointer(canvas,'pointerup',50,100))
  assert.deepEqual(f.inputs.map(i=>i.action),['down','up']);assert.doesNotMatch(f.host.textContent,/plusNativeInputError/)
})

test('manual reconnect must retain the running gesture until pointer-up', async t => {
  const f = await fixture(t, 'ios', 'usb'), canvas=f.host.querySelector('canvas')
  canvas.setPointerCapture=()=>{}; canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:200}); canvas.getContext=()=>({drawImage(){}})
  await act(async()=>f.listeners.get('nativeMirrorState')({id:'owned-session',state:'error'}))
  let completeOpen
  f.main.nativeMirrorOpen=()=>new Promise(resolve=>{completeOpen=resolve})
  await act(async()=>Array.from(f.host.querySelectorAll('button')).find(b=>b.textContent==='retry').click())
  await act(async()=>f.listeners.get('nativeMirrorState')({id:'owned-session',state:'starting'}))
  await act(async()=>f.listeners.get('nativeMirrorState')({id:'owned-session',state:'running',videoMode:'video-starting'}))
  await act(async()=>f.listeners.get('nativeMirrorFrame')({sessionId:'owned-session',sequence:1,timestamp:0,data:new Uint8Array([1])}))
  await act(async()=>f.outputs[0]({displayWidth:390,displayHeight:844,close(){}}))
  await act(async()=>pointer(canvas,'pointerdown',50,100))
  await act(async()=>{completeOpen();await Promise.resolve()})
  await act(async()=>pointer(canvas,'pointerup',50,100))
  assert.deepEqual(f.inputs.map(i=>i.action), ['down','up'])
})

test('pending old PNG must not become a fresh frame after reconnect starts',async t=>{
  let decodeComplete
  const f=await fixture(t,'ios','usb',{ Blob, createImageBitmap:()=>new Promise(resolve=>{decodeComplete=resolve}) })
  const canvas=f.host.querySelector('canvas'),draws=[]
  canvas.getContext=()=>({drawImage(bitmap){draws.push(bitmap.tag)}})
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:200})
  await act(async()=>f.listeners.get('nativeMirrorFrame')({sessionId:'owned-session',sequence:1,timestamp:1,format:'png',data:new Uint8Array([1]),rotation:0}))
  await act(async()=>f.listeners.get('nativeMirrorState')({id:'owned-session',state:'disconnected'}))
  await act(async()=>f.listeners.get('nativeMirrorState')({id:'owned-session',state:'starting'}))
  const resetCount=f.frameStates.length
  await act(async()=>{decodeComplete({tag:'previous-session-image',width:390,height:844,close(){}});await Promise.resolve()})
  const afterReset=f.frameStates.slice(resetCount)
  const results=[];f.main.automationFrameResult=async(id,result)=>results.push(result)
  await act(async()=>f.listeners.get('automationFrameRequest')({requestId:'r',method:'metadata'}))
  assert.equal(draws.length,0)
  assert.equal(afterReset.some(r=>r.state==='presented'),false)
})

test('USB iPhone mode picker sends explicit requests and reflects backend state', async t => {
  const f = await fixture(t, 'ios', 'usb', {}, { state: 'running', videoMode: 'video' })
  const picker = f.host.querySelector('#ios-mirror-tools select')
  const state = (videoMode, state = 'running') => act(async () => {
    f.listeners.get('nativeMirrorState')({ id: 'owned-session', state, videoMode })
  })
  const select = value => act(async () => {
    picker.value = value
    picker.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  assert.equal(picker.value, 'video')
  await select('screenshot')
  await state('screenshot')
  assert.equal(picker.value, 'screenshot')
  await select('video')
  await state('video-starting')
  assert.equal(picker.disabled, true)
  await state('video-error')
  assert.equal(picker.disabled, false)
  assert.equal(picker.selectedOptions[0].disabled, true)
  await select('screenshot')
  await state('screenshot')
  await state('video-error')
  await select('video')
  await state('video')
  assert.deepEqual(f.videos, [[false], [true], [false], [true]])
  await state('video', 'disconnected')
  assert.equal(picker.disabled, true)
})
