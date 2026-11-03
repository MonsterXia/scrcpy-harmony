const assert = require('node:assert/strict')
const { test } = require('node:test')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React
const tick = () => new Promise(setImmediate)
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function mount(t, Component) {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  let unmounted = false
  const unmount = async () => { if (!unmounted) { unmounted = true; await act(async () => root.unmount()) } }
  t.after(async () => { await unmount(); host.remove() })
  await act(async () => root.render(React.createElement(Component)))
  return { host, unmount }
}
test('application log unmount removes its subscription and ignores late initial logs', async t => {
  const request = deferred(), writes = [], listeners = new Set(), disposed = [], menus = [], cleared = []
  class Terminal {
    options = {}; unicode = {}; loadAddon() {} open() {} write(value) { writes.push(value) }
    dispose() { disposed.push(true) } hasSelection() { assert.equal(disposed.length, 0); return false } selectAll() { assert.equal(disposed.length, 0) } clear() { assert.equal(disposed.length, 0) } focus() { assert.equal(disposed.length, 0) }
  }
  const Component = load('src/share/renderer/terminal/components/Terminal.tsx', {
    '@xterm/xterm': { Terminal }, '@xterm/addon-fit': { FitAddon: class { fit() {} } },
    '@xterm/addon-webgl': { WebglAddon: class {} }, '@xterm/addon-canvas': { CanvasAddon: class {} },
    '@xterm/addon-unicode11': { Unicode11Addon: class {} }, '@xterm/xterm/css/xterm.css': {},
    '../store': { theme: 'dark' }, '../../lib/contextMenu': (_, items) => menus.push(items),
    '../../../common/i18n': { t: key => key }, 'common/theme': {},
  }, { main: { getLogs: () => request.promise, clearLogs: async () => cleared.push(true), on: (_, listener) => { listeners.add(listener); return () => listeners.delete(listener) } } }).default
  const f = await mount(t, Component)
  const listener = [...listeners][0]
  await act(async () => listener('live\n'))
  assert.deepEqual(writes, ['live\r\n'])
  await act(async () => f.host.querySelector('.terminal').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true })))
  await f.unmount()
  assert.equal(listeners.size, 0)
  menus[0].filter(item => item.click).forEach(item => item.click())
  assert.deepEqual(cleared, [], 'a queued native menu action must not touch a disposed terminal')
  request.resolve(['late'])
  await tick()
  listener('queued after unsubscribe')
  assert.deepEqual(writes, ['live\r\n'])
  assert.equal(disposed.length, 1)
})
test('auxiliary process store polls only while mounted and ignores disposed results', async () => {
  const requests = [], timers = new Set()
  const store = load('src/share/renderer/process/store.ts', {
    '../store/BaseStore': class {},
  }, {
    main: { getProcessData: () => { const request = deferred(); requests.push(request); return request.promise } },
    setTimeout: fn => { timers.add(fn); return fn }, clearTimeout: fn => timers.delete(fn),
  }).default
  assert.equal(requests.length, 0, 'constructing the singleton must not start polling')
  const stop = store.start()
  assert.equal(requests.length, 1)
  requests[0].reject(new Error('temporary IPC failure'))
  await tick()
  assert.equal(store.error, true)
  assert.equal(timers.size, 1, 'a failure still schedules recovery')
  const poll = [...timers][0]; timers.delete(poll); poll()
  assert.equal(requests.length, 2)
  stop()
  requests[1].resolve([{ pid: 1, name: 'late' }])
  await tick()
  assert.equal(store.processes.length, 0)
  assert.equal(timers.size, 0)
  const stopAgain = store.start()
  requests[2].resolve([{ pid: 2, name: 'current' }])
  await tick()
  assert.equal(store.processes[0].pid, 2)
  assert.equal(store.error, false)
  stopAgain()
  assert.equal(timers.size, 0)
})
test('metric errors are visible, retry recovers, and late unmounted metrics cannot reschedule', async t => {
  const requests = [], timers = new Set()
  const Component = load('src/share/renderer/process/components/Graph.tsx', {
    'luna-performance-monitor/react': () => null,
    '../store': { theme: 'dark' }, 'common/theme': {}, '../../../common/i18n': { t: key => key },
  }, {
    main: { getCpuAndMem: () => { const request = deferred(); requests.push(request); return request.promise } },
    setTimeout: fn => { timers.add(fn); return fn }, clearTimeout: fn => timers.delete(fn),
  }).default
  const f = await mount(t, Component)
  await act(async () => requests[0].reject(new Error('unavailable')))
  assert.ok(f.host.querySelector('[role="alert"]'))
  await act(async () => f.host.querySelector('button').click())
  assert.equal(requests.length, 2)
  await act(async () => requests[1].resolve({ cpu: 10, memory: 1024 }))
  assert.equal(f.host.querySelector('[role="alert"]'), null)
  assert.equal(timers.size, 1)
  const poll = [...timers][0]; timers.delete(poll)
  await act(async () => { void poll() })
  await f.unmount()
  requests[2].resolve({ cpu: 20, memory: 2048 })
  await tick()
  assert.equal(timers.size, 0)
})

test('main shell mounts xterm with its configured font and workspace palette', async t => {
  const options = []
  class Terminal {
    constructor(value) { options.push(value); this.options = value; this.unicode = {} }
    loadAddon() {} open() {} onData() { return { dispose() {} } } focus() {} dispose() {}
  }
  const Component = load('src/renderer/main/components/shell/Term.tsx', {
    '@xterm/xterm': { Terminal }, '@xterm/addon-fit': { FitAddon: class { fit() {} } },
    '@xterm/addon-webgl': { WebglAddon: class {} }, '@xterm/addon-canvas': { CanvasAddon: class {} },
    '@xterm/addon-unicode11': { Unicode11Addon: class {} }, '@xterm/xterm/css/xterm.css': {},
    '../../store': { target: null, theme: 'dark' }, 'common/theme': { fontFamilyCode: 'configured-code-font' },
    'common/util': { t: key => key }, 'licia/isHidden': () => false, 'share/renderer/lib/contextMenu': () => {},
  }, { main: { on: () => () => {} }, ResizeObserver: class { observe() {} disconnect() {} } }).default
  await mount(t, () => React.createElement(Component, { visible: true, onCreate() {}, onSessionIdChange() {} }))
  assert.equal(options[0].fontFamily, 'configured-code-font')
  assert.equal(options[0].theme.background, '#202329')
})
