const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const Module = require('node:module')
const { buildSync } = require('esbuild')
const { DOMParser } = require('@xmldom/xmldom')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React
window.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
})
global.Node = window.Node
global.ShadowRoot = window.ShadowRoot
const filename = path.resolve(
  'node_modules/luna-dom-viewer/esm/dom-viewer/react.js',
)
const moduleCode = buildSync({
  entryPoints: [filename],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  define: { module: 'undefined' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
}).outputFiles[0].text
const widgetModule = new Module(filename)
widgetModule.paths = require.resolve.paths('react')
widgetModule._compile(moduleCode, filename)

test('layout tree exposes a keyboard entry point and retains Luna arrow selection', async (t) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  const selections = []
  const store = { theme: 'light', layout: { attribute: true } }
  const hierarchy = new DOMParser().parseFromString(
    '<Layout><Node text="hello" /></Layout>',
    'text/xml',
  )
  const Tree = load('src/renderer/main/components/layout/Tree.tsx', {
    '../../store': store,
    'common/util': { t: (key) => key },
    'licia/copy': () => {},
    'share/renderer/components/CopyButton': () => null,
    'luna-dom-viewer/react': widgetModule.exports,
    '../common/loading': { PannelLoading: () => null },
  }).default
  await act(async () =>
    root.render(
      React.createElement(Tree, {
        hierarchy,
        isLoading: false,
        onDomViewerCreate: (viewer) => viewer.expand(),
        selected: null,
        onSelect: (node) => selections.push(node),
      }),
    ),
  )
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const entry = host.querySelector('[role="tree"]')
  assert.ok(entry)
  assert.equal(entry.tabIndex, 0)
  await act(async () => entry.focus())
  assert.equal(selections.at(-1), hierarchy.documentElement)
  assert.ok(host.contains(document.activeElement))
  await act(async () =>
    document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'ArrowDown',
        keyCode: 40,
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  assert.equal(selections.at(-1), hierarchy.documentElement.firstChild)
  const focused = document.activeElement
  await act(async () =>
    root.render(
      React.createElement(Tree, {
        hierarchy,
        isLoading: false,
        onDomViewerCreate: (viewer) => viewer.expand(),
        selected: hierarchy.documentElement.firstChild,
        onSelect: (node) => selections.push(node),
      }),
    ),
  )
  assert.equal(document.activeElement, focused)
  store.layout.attribute = false
  await act(async () =>
    root.render(
      React.createElement(Tree, {
        hierarchy,
        isLoading: false,
        onDomViewerCreate: (viewer) => viewer.expand(),
        selected: hierarchy.documentElement.firstChild,
        onSelect: (node) => selections.push(node),
      }),
    ),
  )
  assert.equal(
    host.querySelectorAll('.luna-dom-viewer-selected').length,
    1,
    'selected component remains highlighted after toggling attributes',
  )
})
