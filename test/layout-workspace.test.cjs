const assert = require('node:assert/strict')
const { test } = require('node:test')
const { observable, runInAction } = require('mobx')
const { buildSync } = require('esbuild')
const Module = require('node:module')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React
const h = React.createElement
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

window.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
})
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
}
const splitFilename = require.resolve('luna-split-pane/react')
const splitModule = new Module(splitFilename)
splitModule.paths = require.resolve.paths('react')
splitModule._compile(
  buildSync({
    entryPoints: [splitFilename],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    define: { module: 'undefined' },
    external: ['react', 'react/jsx-runtime'],
    write: false,
  }).outputFiles[0].text,
  splitFilename,
)

async function fixture(t, realSplit = false) {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  const captures = [],
    dumps = [],
    decodes = [],
    saves = []
  const store = observable({
    target: { key: 'a' },
    panel: 'layout',
    layout: {
      weights: [30, 40, 30],
      attribute: false,
      border: true,
      set(key, value) {
        saves.push(value)
        this[key] = value
      },
    },
  })
  let resize, pane, tree, image
  const Layout = load(
    'src/renderer/main/components/layout/Layout.tsx',
    {
      '../../store': store,
      'luna-toolbar/react': {
        __esModule: true,
        default: ({ children }) => h('div', null, children),
        LunaToolbarButton: ({ children, ...props }) =>
          h('button', props, children),
        LunaToolbarCheckbox: () => null,
        LunaToolbarSeparator: () => null,
        LunaToolbarSpace: () => null,
        LunaToolbarText: () => null,
      },
      'share/renderer/components/ToolbarIcon': ({ title, disabled, onClick }) =>
        h('button', { disabled, onClick }, title),
      'share/renderer/components/CopyButton': () => null,
      'common/util': { t: (key) => key },
      'licia/copy': () => {},
      'licia/download': () => {},
      'licia/loadImg': (url, callback) => decodes.push(callback),
      './Tree': (props) => {
        tree = props
        return h(
          'button',
          {
            onClick: () => props.onSelect(props.hierarchy?.documentElement),
            'data-tree': true,
          },
          'tree',
        )
      },
      './Screenshot': (props) => {
        image = props.image
        return h('div', { 'data-preview': true })
      },
      './Detail': ({ selected }) =>
        h('div', { 'data-detail': true }, selected?.tagName),
      'luna-split-pane/react': realSplit
        ? splitModule.exports
        : {
            __esModule: true,
            default: (props) => {
              pane = props
              return h(
                'div',
                { 'data-panes': React.Children.toArray(props.children).length },
                props.children,
              )
            },
            LunaSplitPaneItem: ({ children }) => h('div', null, children),
          },
    },
    {
      main: {
        screencap: () => {
          const d = deferred()
          captures.push(d)
          return d.promise
        },
        dumpLayout: () => {
          const d = deferred()
          dumps.push(d)
          return d.promise
        },
      },
      ResizeObserver: class {
        constructor(callback) {
          resize = callback
        }
        observe() {}
        disconnect() {}
      },
    },
    new Map(),
    true,
  ).default
  await act(async () => root.render(h(Layout)))
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  return {
    host,
    store,
    captures,
    dumps,
    decodes,
    saves,
    image: () => image,
    tree: () => tree,
    resize: (width) => act(async () => resize([{ contentRect: { width } }])),
    split: (weights) => act(async () => pane.onResize(weights)),
    settle: (d, value, fail = false) =>
      act(async () => d[fail ? 'reject' : 'resolve'](value)),
    click: (label) =>
      act(async () =>
        [...host.querySelectorAll('button')]
          .find(
            (b) =>
              b.textContent === label || b.getAttribute('aria-label') === label,
          )
          .click(),
      ),
    decode: (error = null) =>
      act(async () =>
        decodes.at(-1)(error, error ? undefined : { width: 100, height: 200 }),
      ),
  }
}
async function complete(
  f,
  xml = '<Layout><Node bounds="[1,2][3,4]">existing text</Node></Layout>',
) {
  await f.settle(f.captures.at(-1), 'AA==')
  // Capture and hierarchy may be read serially; settle whichever stage is ready.
  if (f.decodes.length) await f.decode()
  await f.settle(f.dumps.at(-1), xml)
  if (!f.image().url) await f.decode()
}

test('layout IPC failure clears busy, shows retry and permits one new refresh', async (t) => {
  const f = await fixture(t)
  await f.settle(f.captures[0], new Error('offline'), true)
  assert.equal(f.host.querySelector('[aria-busy="true"]'), null)
  assert.ok(f.host.querySelector('[role="alert"]'))
  await f.click('retry')
  assert.equal(f.captures.length, 2)
  await complete(f)
  assert.equal(f.host.querySelector('[role="alert"]'), null)
  assert.equal(
    f.tree().hierarchy.documentElement.firstChild.getAttribute('width'),
    '2',
  )
})
test('layout decode failure is recoverable and never exposes a broken preview', async (t) => {
  const f = await fixture(t)
  await f.settle(f.captures[0], 'AA==')
  await f.decode(new Error('decode'))
  assert.ok(f.host.querySelector('[role="alert"]'))
  assert.equal(f.image().url, '')
  await f.click('retry')
  await complete(f)
  assert.ok(f.image().url)
})
test('layout refresh uses a synchronous single flight and discards stale target stages', async (t) => {
  const f = await fixture(t)
  await f.click('refresh')
  assert.equal(f.captures.length, 1)
  await act(async () =>
    runInAction(() => {
      f.store.target = { key: 'b' }
    }),
  )
  await f.settle(f.captures[0], 'AA==')
  assert.equal(f.decodes.length, 0)
  assert.equal(f.dumps.length, 0)
  await complete(f)
  assert.ok(f.image().url)
})
test('compact layout keeps three saved weights and exposes one properties drawer with focus return', async (t) => {
  const f = await fixture(t)
  await complete(f)
  await f.resize(1100)
  assert.equal(f.host.querySelector('[data-panes]').dataset.panes, '3')
  await f.split([25, 45, 30])
  await f.resize(700)
  assert.equal(f.host.querySelector('[data-panes]').dataset.panes, '2')
  await f.split([55, 45])
  assert.deepEqual(Array.from(f.store.layout.weights), [25, 45, 30])
  assert.equal(f.host.querySelector('[data-detail]'), null)
  const opener = [...f.host.querySelectorAll('button')].find(
    (b) => b.textContent === 'layoutProperties',
  )
  opener.focus()
  await f.click('layoutProperties')
  const dialog = f.host.querySelector('[role="dialog"]')
  assert.equal(f.host.querySelectorAll('[data-detail]').length, 1)
  assert.ok(dialog.contains(document.activeElement))
  await act(async () =>
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  )
  assert.equal(f.host.querySelector('[role="dialog"]'), null)
  assert.equal(document.activeElement, opener)
  await f.resize(1100)
  assert.equal(f.host.querySelectorAll('[data-detail]').length, 1)
  assert.deepEqual(Array.from(f.store.layout.weights), [25, 45, 30])
})

test('actual Luna split pane mounts compact and wide without null child crashes', async (t) => {
  const f = await fixture(t, true)
  await complete(f)
  await f.resize(1100)
  assert.equal(f.host.querySelectorAll('[data-detail]').length, 1)
  await f.resize(700)
  assert.equal(f.host.querySelectorAll('[data-detail]').length, 0)
})

for (const failure of ['dump', 'xml']) {
  test(`layout ${failure} failure clears loading and can refresh again`, async (t) => {
    const f = await fixture(t)
    await f.settle(f.captures[0], 'AA==')
    await f.decode()
    await f.settle(
      f.dumps[0],
      failure === 'dump' ? new Error('dump') : '<Layout>',
      failure === 'dump',
    )
    assert.ok(f.host.querySelector('[role="alert"]'))
    assert.equal(f.host.querySelector('[aria-busy="true"]'), null)
    await f.click('retry')
    await complete(f)
    assert.equal(f.host.querySelector('[role="alert"]'), null)
  })
}

test('late layout image decode cannot request or replace a new device hierarchy', async (t) => {
  const f = await fixture(t)
  await f.settle(f.captures[0], 'AA==')
  const oldDecode = f.decodes[0]
  await act(async () =>
    runInAction(() => {
      f.store.target = { key: 'b' }
    }),
  )
  await complete(f)
  const currentImage = f.image()
  await act(async () => oldDecode(null, { width: 900, height: 900 }))
  assert.equal(f.dumps.length, 1)
  assert.equal(f.image(), currentImage)
})
