const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const Module = require('node:module')
const { buildSync } = require('esbuild')
const { observable, runInAction } = require('mobx')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup(),
  { act } = React
const computedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = (element) => computedStyle(element)
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
})
global.ResizeObserver = window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.MutationObserver = window.MutationObserver
global.HTMLElement = window.HTMLElement
global.Element = window.Element
global.requestAnimationFrame = (callback) => setTimeout(callback, 0)
global.cancelAnimationFrame = clearTimeout
window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '')
}
window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open')
}
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
  get: () => 400,
})
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
  get: () => 800,
})
window.HTMLElement.prototype.getBoundingClientRect = () => ({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 800,
  bottom: 400,
  width: 800,
  height: 400,
})
function realWidget(name) {
  const filename = path.resolve(
    `node_modules/luna-${name}/esm/${name}/react.js`,
  )
  const result = buildSync({
    entryPoints: [filename],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    define: { module: 'undefined' },
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  })
  const module = new Module(filename)
  module.paths = require.resolve.paths('react')
  module._compile(result.outputFiles[0].text, filename)
  return module.exports
}
const RealGrid = realWidget('data-grid')
const RealLogcat = realWidget('logcat')
const RealToolbar = realWidget('toolbar')
const RealTab = realWidget('tab')
const RealPalette = realWidget('command-palette')
const ToolbarIcon = load('src/share/renderer/components/ToolbarIcon.tsx', {
  'luna-toolbar/react': RealToolbar,
}).default
const translate = (key, values) =>
  values?.name ? `${key}: ${values.name}` : key
const delay = () =>
  act(async () => new Promise((resolve) => setTimeout(resolve, 45)))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function button(host, name) {
  return [...host.querySelectorAll('button')].find(
    (node) =>
      node.textContent === name ||
      node.getAttribute('aria-label') === name ||
      node.getAttribute('aria-label')?.startsWith(`${name}:`) ||
      node.querySelector(`[title="${name}"]`),
  )
}
async function fixture(
  t,
  file,
  {
    store = observable({
      target: { key: 'A', name: 'Device' },
      panel: 'shell',
      theme: 'light',
    }),
    main = {},
    mocks = {},
    globals = {},
    props = {},
  } = {},
) {
  const host = document.body.appendChild(document.createElement('div')),
    root = createRoot(host)
  const View = load(
    `src/renderer/main/components/${file}.tsx`,
    {
      '../../store': store,
      'common/util': { t: translate },
      'share/renderer/lib/hooks': { useWindowResize() {} },
      'share/renderer/lib/contextMenu': () => {},
      'luna-data-grid/react': RealGrid,
      'luna-logcat/react': RealLogcat,
      'luna-toolbar/react': RealToolbar,
      'luna-tab/react': RealTab,
      'luna-command-palette/react': RealPalette,
      'share/renderer/components/ToolbarIcon': ToolbarIcon,
      'luna-modal': { confirm: async () => true },
      ...mocks,
    },
    { main, ResizeObserver: window.ResizeObserver, ...globals },
  ).default
  const render = (values) =>
    act(async () =>
      root.render(React.createElement(View, { ...props, ...values })),
    )
  await render()
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  return { host, root, store, render }
}

function processStore() {
  return observable({
    target: { key: 'A' },
    panel: 'process',
    process: {
      onlyBundle: false,
      set(key, value) {
        this[key] = value
      },
    },
  })
}
const processes = [
  { pid: '1', name: 'com.example.app', '%cpu': '1', res: '1M' },
  { pid: '2', name: 'system', '%cpu': '0', res: '2M' },
]
test('process real Luna rows support keyboard selection, stop confirmation and immediate bundle filtering', async (t) => {
  const stopped = [],
    f = await fixture(t, 'process/Process', {
      store: processStore(),
      main: {
        getBundles: async () => ['com.example.app'],
        getProcesses: async () => processes,
        stopBundle: async (...args) => stopped.push(args),
      },
    })
  await delay()
  const row = f.host.querySelector('.luna-data-grid-node')
  assert.equal(row.tabIndex, 0)
  row.focus()
  await act(async () =>
    row.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    ),
  )
  assert.equal(button(f.host, 'stop').disabled, false)
  await act(async () => button(f.host, 'stop').click())
  assert.ok(f.host.querySelector('[role="alertdialog"]'))
  assert.ok(f.host.querySelector('[inert]'))
  await act(async () => f.host.querySelector('[data-confirm-accept]').click())
  assert.deepEqual(stopped, [['A', 'com.example.app']])
  await act(async () => f.host.querySelector('input[type="checkbox"]').click())
  await delay()
  assert.equal(f.host.querySelectorAll('.luna-data-grid-node').length, 1)
})

test('process stop is bound to the originating device and selected PID survives a refresh', async (t) => {
  const stopped = [],
    f = await fixture(t, 'process/Process', {
      store: processStore(),
      main: {
        getBundles: async () => ['com.example.app'],
        getProcesses: async () => processes.map((p) => ({ ...p })),
        stopBundle: async (...args) => stopped.push(args),
      },
    })
  await delay()
  await act(async () =>
    f.host
      .querySelector('.luna-data-grid-node')
      .dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      ),
  )
  await act(async () => button(f.host, 'refresh').click())
  assert.equal(button(f.host, 'stop').disabled, false)
  await act(async () => button(f.host, 'stop').click())
  await act(async () =>
    runInAction(() => {
      f.store.target = { key: 'B' }
    }),
  )
  const accept = f.host.querySelector('[data-confirm-accept]')
  if (accept) await act(async () => accept.click())
  assert.deepEqual(stopped, [])
})

test('process late old-device results cannot overwrite the new device', async (t) => {
  const old = deferred(),
    f = await fixture(t, 'process/Process', {
      store: processStore(),
      main: {
        getBundles: async () => [],
        getProcesses: (key) =>
          key === 'A'
            ? old.promise
            : Promise.resolve([{ pid: '3', name: 'new-device', res: '1M' }]),
      },
    })
  await act(async () =>
    runInAction(() => {
      f.store.target = { key: 'B' }
    }),
  )
  await act(async () => old.resolve(processes))
  await delay()
  assert.match(
    f.host.querySelector('[data-process-pid="3"]').getAttribute('aria-label'),
    /new-device/,
  )
  assert.equal(f.host.querySelector('[data-process-pid="1"]'), null)
})

test('process rejection displays recovery and retry works without unhandled rejection', async (t) => {
  const pending = deferred()
  let calls = 0
  const f = await fixture(t, 'process/Process', {
    store: processStore(),
    main: {
      getBundles: async () => [],
      getProcesses: () =>
        ++calls === 1 ? pending.promise : Promise.resolve(processes),
    },
  })
  await act(async () => pending.reject(Error('synthetic failure')))
  assert.ok(f.host.querySelector('[role="alert"]'))
  await act(async () => button(f.host, 'refresh').click())
  await delay()
  assert.match(
    f.host.querySelector('[data-process-pid="1"]').getAttribute('aria-label'),
    /com.example.app/,
  )
})

test('process polls only on the active page and a rejected poll schedules recovery', async (t) => {
  const scheduled = new Map()
  let sequence = 0,
    calls = 0
  const f = await fixture(t, 'process/Process', {
    store: processStore(),
    main: {
      getBundles: async () => [],
      getProcesses: async () => {
        calls++
        if (calls === 2) throw Error('poll failure')
        return processes
      },
    },
    globals: {
      setTimeout(fn, ms) {
        if (ms !== 5000) return setTimeout(fn, ms)
        const id = { sequence: sequence++ }
        scheduled.set(id, fn)
        return id
      },
      clearTimeout(id) {
        if (scheduled.has(id)) scheduled.delete(id)
        else clearTimeout(id)
      },
    },
  })
  assert.equal(calls, 1)
  const tick = async () => {
    const [id, fn] = scheduled.entries().next().value
    scheduled.delete(id)
    await act(async () => fn())
  }
  await tick()
  assert.ok(f.host.querySelector('[role="alert"]'))
  assert.equal(scheduled.size, 1, 'failure must not kill subsequent polling')
  await tick()
  assert.equal(f.host.querySelector('[role="alert"]'), null)
  await act(async () =>
    runInAction(() => {
      f.store.panel = 'shell'
    }),
  )
  assert.equal(scheduled.size, 0)
  assert.equal(calls, 3)
  await act(async () =>
    runInAction(() => {
      f.store.panel = 'process'
    }),
  )
  assert.equal(calls, 4)
})

test('shell can close its last tab, add a new tab, and opening shortcuts runs nothing', async (t) => {
  const writes = []
  const f = await fixture(t, 'shell/Shell', {
    mocks: {
      './Term': (props) =>
        React.createElement('div', { 'data-term-visible': props.visible }),
    },
    main: { writeShell: async (...args) => writes.push(args) },
  })
  const close = button(f.host, 'closeShell')
  assert.ok(close, 'a native close control is keyboard accessible')
  await act(async () => close.click())
  assert.match(f.host.textContent, /shellEmpty/)
  await act(async () => button(f.host, 'add').click())
  assert.equal(f.host.querySelectorAll('[role="tab"]').length, 1)
  await act(async () => button(f.host, 'shortcut').click())
  assert.ok(f.host.querySelector('dialog[open]'))
  assert.deepEqual(writes, [])
})

function terminalBoundary() {
  const instances = [],
    resize = [],
    menus = [],
    fit = []
  class Terminal {
    constructor() {
      this.options = {}
      this.unicode = {}
      this.disposed = false
      this.input = null
      instances.push(this)
    }
    loadAddon() {}
    open() {}
    write(data) {
      assert.equal(this.disposed, false)
      this.lastWrite = data
    }
    focus() {
      assert.equal(this.disposed, false)
    }
    reset() {
      assert.equal(this.disposed, false)
    }
    clear() {}
    dispose() {
      this.disposed = true
    }
    onData(fn) {
      this.input = fn
      return {
        dispose: () => {
          this.input = null
        },
      }
    }
  }
  return {
    instances,
    resize,
    menus,
    fit,
    mocks: {
      '@xterm/xterm': { Terminal },
      '@xterm/xterm/css/xterm.css': {},
      '@xterm/addon-fit': {
        FitAddon: class {
          fit() {
            fit.push(true)
          }
        },
      },
      '@xterm/addon-canvas': { CanvasAddon: class {} },
      '@xterm/addon-webgl': { WebglAddon: class {} },
      '@xterm/addon-unicode11': { Unicode11Addon: class {} },
      'common/theme': {},
      'licia/isHidden': () => false,
      'share/renderer/lib/contextMenu': (_, template) => menus.push(template),
    },
    globals: {
      ResizeObserver: class {
        constructor(fn) {
          this.fn = fn
          resize.push(this)
        }
        observe() {}
        disconnect() {
          this.closed = true
        }
      },
    },
  }
}
test('terminal late create is killed after unmount and never touches disposed xterm', async (t) => {
  const pending = deferred(),
    killed = [],
    b = terminalBoundary()
  const f = await fixture(t, 'shell/Term', {
    ...b,
    main: {
      on: () => () => {},
      createShell: () => pending.promise,
      killShell: async (id) => killed.push(id),
    },
    props: { visible: true, onCreate() {}, onSessionIdChange() {} },
  })
  await act(async () => f.root.unmount())
  await act(async () => pending.resolve('late'))
  assert.deepEqual(killed, ['late'])
  assert.equal(b.instances[0].input, null)
})

test('terminal reset invalidates a pending create, visibility fits without killing, cleanup detaches input and observer', async (t) => {
  const first = deferred(),
    second = deferred(),
    b = terminalBoundary(),
    killed = [],
    writes = [],
    sessions = []
  let n = 0
  const f = await fixture(t, 'shell/Term', {
    ...b,
    main: {
      on: () => () => {},
      createShell: () => (++n === 1 ? first.promise : second.promise),
      killShell: async (id) => killed.push(id),
      writeShell: async (...args) => writes.push(args),
    },
    props: {
      visible: true,
      onCreate() {},
      onSessionIdChange: (id) => sessions.push(id),
    },
  })
  await act(async () =>
    f.host
      .querySelector('.term')
      .dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true })),
  )
  await act(async () =>
    b.menus[0].find((item) => item.label === 'reset').click(),
  )
  await act(async () => second.resolve('current'))
  await act(async () => first.resolve('obsolete'))
  assert.deepEqual(killed, ['obsolete'])
  assert.equal(sessions.at(-1), 'current')
  await act(async () => b.instances[0].input('hello'))
  assert.deepEqual(writes, [['current', 'hello']])
  await f.render({ visible: false })
  assert.deepEqual(killed, ['obsolete'])
  await f.render({ visible: true })
  assert.ok(b.resize.length, 'native ResizeObserver observes the terminal')
  await act(async () => f.root.unmount())
  assert.deepEqual(killed, ['obsolete', 'current'])
  assert.equal(b.instances[0].input, null)
  assert.equal(b.resize[0].closed, true)
})

test('a shortcut write that finishes after its tab closes cannot focus disposed xterm', async (t) => {
  const b = terminalBoundary(),
    pending = deferred(),
    writes = []
  let sequence = 0
  const f = await fixture(t, 'shell/Shell', {
    ...b,
    main: {
      on: () => () => {},
      createShell: async () => `session-${++sequence}`,
      killShell: async () => {},
      writeShell: (...args) => {
        writes.push(args)
        return pending.promise
      },
    },
  })
  await act(async () => button(f.host, 'shortcut').click())
  assert.deepEqual(writes, [])
  const command = [...f.host.querySelectorAll('dialog button')].find((node) =>
    node.textContent.includes('reboot'),
  )
  assert.ok(command)
  await act(async () => command.click())
  assert.deepEqual(writes, [['session-1', 'reboot\n']])
  await act(async () => button(f.host, 'closeShell').click())
  assert.equal(b.instances[0].disposed, true)
  await act(async () => pending.resolve())
  await delay()
})

test('terminal create and input errors are visible and reset retries the actual session', async (t) => {
  const b = terminalBoundary()
  let sequence = 0
  const f = await fixture(t, 'shell/Term', {
    ...b,
    main: {
      on: () => () => {},
      createShell: async () => {
        if (++sequence === 1) throw Error('open failed')
        return 'recovered'
      },
      killShell: async () => {},
      writeShell: async () => {
        throw Error('input failed')
      },
    },
    props: { visible: true, onCreate() {}, onSessionIdChange() {} },
  })
  assert.ok(f.host.querySelector('[role="alert"]'))
  await act(async () => button(f.host, 'retry').click())
  assert.equal(f.host.querySelector('[role="alert"]'), null)
  await act(async () => b.instances[0].input('test'))
  assert.ok(f.host.querySelector('[role="alert"]'))
})

async function logFixture(t, overrides = {}, onLogcat, mocks = {}) {
  const listeners = new Map(),
    closed = [],
    control = [],
    opens = [],
    downloads = []
  const f = await fixture(t, 'hilog/Hilog', {
    store: observable({ target: { key: 'A', name: 'Device' }, panel: 'hilog' }),
    main: {
      on: (event, fn) => {
        listeners.set(event, fn)
        return () => listeners.delete(event)
      },
      openHilog: (key) => {
        const d = deferred()
        opens.push({ ...d, key })
        return d.promise
      },
      closeHilog: async (id) => closed.push(id),
      pauseHilog: async (id) => control.push(['pause', id]),
      resumeHilog: async (id) => control.push(['resume', id]),
      ...overrides,
    },
    mocks: {
      'licia/download': (...args) => downloads.push(args),
      ...mocks,
      ...(onLogcat
        ? {
            'luna-logcat/react': (props) =>
              React.createElement(RealLogcat.default || RealLogcat, {
                ...props,
                onCreate: (widget) => {
                  onLogcat(widget)
                  props.onCreate?.(widget)
                },
              }),
          }
        : {}),
    },
  })
  return { ...f, listeners, closed, control, opens, downloads }
}
test('hilog closes late opens and restart generations, hiding pauses and showing resumes without reopening', async (t) => {
  const f = await logFixture(t)
  await act(async () => button(f.host, 'restart').click())
  assert.equal(f.opens.length, 2)
  await act(async () => f.opens[1].resolve('new'))
  await act(async () => f.opens[0].resolve('old'))
  assert.deepEqual(f.closed, ['old'])
  await act(async () =>
    runInAction(() => {
      f.store.panel = 'shell'
    }),
  )
  assert.deepEqual(f.control.at(-1), ['pause', 'new'])
  await act(async () =>
    runInAction(() => {
      f.store.panel = 'hilog'
    }),
  )
  assert.deepEqual(f.control.at(-1), ['resume', 'new'])
  assert.equal(f.opens.length, 2)
  await act(async () => f.root.unmount())
  assert.deepEqual(f.closed, ['old', 'new'])
})

test('hilog late open after unmount is closed and failed opens offer retry', async (t) => {
  const f = await logFixture(t)
  await act(async () => f.opens[0].reject(Error('synthetic open failure')))
  assert.ok(f.host.querySelector('[role="alert"]'))
  await act(async () => button(f.host, 'restart').click())
  await act(async () => f.root.unmount())
  await act(async () => f.opens[1].resolve('late'))
  assert.deepEqual(f.closed, ['late'])
})

test('hilog filtering exposes no results while Save still exports hidden records', async (t) => {
  const f = await logFixture(t)
  await act(async () => f.opens[0].resolve('log'))
  await act(async () =>
    f.listeners.get('hilogEntry')('log', {
      date: '2026-11-03T00:00:00Z',
      pid: 1,
      tid: 1,
      level: 4,
      type: 0,
      domain: '00000',
      tag: 'test',
      bundleName: 'com.example.app',
      message: 'retained-message',
    }),
  )
  const priority = f.host.querySelectorAll('select')[1]
  await act(async () => {
    priority.value = '6'
    priority.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  assert.match(f.host.textContent, /hilogNoResults/)
  await act(async () => button(f.host, 'save').click())
  assert.match(f.downloads[0][0], /retained-message/)
  await act(async () => {
    priority.value = '2'
    priority.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  assert.doesNotMatch(f.host.textContent, /hilogNoResults/)
})

test('hilog export retains the same bounded entries as real Luna, paused events do not enter the buffer, clear empties export', async (t) => {
  let widget
  const copied = [],
    menus = []
  const f = await logFixture(
    t,
    {},
    (value) => {
      widget = value
    },
    {
      'licia/copy': (value) => copied.push(value),
      'share/renderer/lib/contextMenu': (_, template) => menus.push(template),
    },
  )
  await act(async () => f.opens[0].resolve('log'))
  const emit = (message) =>
    f.listeners.get('hilogEntry')('log', {
      date: '2026-11-03T00:00:00Z',
      pid: 1,
      tid: 1,
      level: 4,
      type: 0,
      domain: '00000',
      tag: 'test',
      message,
    })
  // Luna removes 1,000 oldest records when the 10,000 limit + batch is reached.
  await act(async () => {
    for (let i = 0; i < 11000; i++) emit(`message-${i}`)
  })
  await act(async () => button(f.host, 'pause').click())
  await act(async () => emit('paused-message'))
  await act(async () => button(f.host, 'save').click())
  const lines = f.downloads[0][0].split('\n')
  assert.equal(lines.length, 10000)
  assert.match(lines[0], /message-1000$/)
  assert.match(lines.at(-1), /message-10999$/)
  assert.equal(
    widget.entries.length,
    lines.length,
    'real Luna retained buffer agrees with export',
  )
  assert.equal(
    widget.displayEntries.length,
    lines.length,
    'real Luna display buffer agrees with export',
  )
  assert.doesNotMatch(f.downloads[0][0], /paused-message/)
  // Luna's stored data-idx predates batch eviction. The UI must copy the
  // actual visible row, even when the engine's shifted entry lookup differs.
  // jsdom has no measured log heights. Materialize a real retained row in its
  // owning widget so its actual delegated context-menu handler can receive it.
  const row = widget.entries[0].container
  widget.container.appendChild(row)
  const visibleMessage = row.querySelector('.luna-logcat-message').textContent
  await act(async () =>
    row.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true })),
  )
  await act(async () =>
    menus
      .at(-1)
      .find((item) => item.label === 'copy')
      .click(),
  )
  assert.deepEqual(copied, [visibleMessage])
  await act(async () => button(f.host, 'clear').click())
  assert.equal(button(f.host, 'save').disabled, true)
  assert.equal(widget.entries.length, 0)
  assert.equal(
    widget.displayEntries.length,
    0,
    'clear must also reset Luna display bookkeeping before future eviction',
  )
})
