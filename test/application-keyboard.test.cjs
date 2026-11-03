const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const { buildSync } = require('esbuild')
const Module = require('node:module')
const { observable } = require('mobx')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
global.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
global.MutationObserver = window.MutationObserver
global.HTMLElement = window.HTMLElement
global.Element = window.Element
global.requestAnimationFrame = callback => setTimeout(callback, 0)
global.cancelAnimationFrame = clearTimeout
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 400 })
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 800 })
window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400 })


function realWidget(name) {
  const filename = path.resolve(`node_modules/luna-${name}/esm/${name}/react.js`)
  const result = buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs', write: false, define: { module: 'undefined' }, external: ['react', 'react-dom', 'react/jsx-runtime'] })
  const module = new Module(filename)
  module.paths = require.resolve.paths('react')
  module._compile(result.outputFiles[0].text, filename)
  return module.exports
}
const RealGrid = realWidget('data-grid')
const RealIcons = realWidget('icon-list')

async function fixture(t, listView, count = 1) {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  const store = observable({ target: { key: 'device-a' }, application: {
    sysBundle: false, listView, itemSize: 48, set(key, value) { this[key] = value },
  } })
  const info = { bundleName: 'com.example.notes', label: '<Notes>', icon: '', system: false, versionName: '1', apiTargetVersion: 20, installTime: 0, releaseType: 'Release', mainAbility: 'Main' }
  const stopped = []
  const listeners = new Map()
  const Application = load('src/renderer/main/components/application/Application.tsx', {
    '../../store': store,
    '../common/loading': { PannelLoading: () => null },
    'common/util': { t: (key, values) => values?.name ? `${key}: ${values.name}` : key },
    'share/renderer/lib/util': { notify() {}, isFileDrop() { return false } },
    'share/renderer/lib/hooks': { useWindowResize() {} },
    'share/renderer/lib/contextMenu': () => {},
    '../../../lib/util': { installBundles() {} },
    '../../../assets/default-icon.png': 'default.png',
    'luna-data-grid/react': RealGrid,
    'luna-icon-list/react': RealIcons,
    'licia/copy': () => {},
    'luna-modal': { confirm: async () => true },
  }, { main: { getBundles: async () => count === 1 ? [info.bundleName] : Array.from({ length: count }, (_, i) => `com.example.app${i}`), getBundleInfos: async (_, names) => names.map(bundleName => ({ ...info, bundleName })), on: (event, callback) => { listeners.set(event, callback); return () => listeners.delete(event) }, stopBundle: async (...args) => stopped.push(args) } }).default
  await act(async () => root.render(React.createElement(Application)))
  // Luna batches virtual DOM insertion on its own timer.
  await act(async () => new Promise(resolve => setTimeout(resolve, 40)))
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  const item = () => host.querySelector(listView ? '.luna-data-grid-node' : '.luna-icon-list-item')
  return { host, item, stopped, refresh: () => act(async () => listeners.get('bundleInstalled')?.('device-a')) }
}

for (const listView of [true, false]) {
  test(`real Luna ${listView ? 'grid' : 'icons'} permits keyboard details and restores the item after close`, async t => {
    const f = await fixture(t, listView)
    const item = f.item()
    assert.ok(item, 'real Luna renders the application item')
    assert.equal(item.tabIndex, 0, 'an application has a keyboard entry point')
    item.focus()
    await act(async () => item.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    const dialog = f.host.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.ok(dialog.contains(document.activeElement))
    await act(async () => dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await act(async () => new Promise(resolve => setTimeout(resolve, 40)))
    assert.equal(f.host.querySelector('[role="dialog"]'), null)
    assert.equal(document.activeElement, f.item(), 'focus remains on the real widget item after its update effects')
  })
}

test('application destructive confirmation has keyboard cancel, literal labels and only one active modal', async t => {
  const f = await fixture(t, true)
  await act(async () => f.item().dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  await act(async () => new Promise(resolve => setTimeout(resolve, 230)))
  const stop = [...f.host.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'stop')
  assert.ok(stop)
  stop.focus()
  await act(async () => stop.click())
  const confirmation = f.host.querySelector('[role="alertdialog"]')
  assert.ok(confirmation, 'confirmation has native semantic controls')
  assert.equal(f.host.querySelectorAll('[aria-modal="true"]').length, 1)
  assert.ok(confirmation.contains(document.activeElement))
  assert.ok(confirmation.textContent.includes('<Notes>'))
  assert.equal(confirmation.querySelector('notes'), null)
  const buttons = [...confirmation.querySelectorAll('button')]
  buttons.at(-1).focus()
  await act(async () => buttons.at(-1).dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
  assert.equal(document.activeElement, buttons[0])
  await act(async () => confirmation.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(f.stopped.length, 0)
  assert.equal(f.host.querySelector('[role="alertdialog"]'), null)
  assert.ok(f.host.querySelector('[role="dialog"]').contains(document.activeElement))
  await act(async () => stop.click())
  await act(async () => f.host.querySelector('[data-confirm-accept]').click())
  assert.deepEqual(f.stopped, [['device-a', 'com.example.notes']])
})

test('refreshing an open real-widget detail restores focus to the stable search field', async t => {
  const f = await fixture(t, true)
  f.item().focus()
  await act(async () => f.item().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  assert.ok(f.host.querySelector('[role="dialog"]'))
  await f.refresh()
  await act(async () => new Promise(resolve => setTimeout(resolve, 40)))
  assert.equal(f.host.querySelector('[role="dialog"]'), null)
  assert.equal(document.activeElement, f.host.querySelector('input[type="search"]'))
})

async function scrollGrid(f, top) {
  const scroller = f.host.querySelector('.luna-data-grid-data-container')
  Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true })
  scroller.scrollTop = top
  await act(async () => scroller.dispatchEvent(new window.Event('scroll')))
  await act(async () => new Promise(resolve => setTimeout(resolve, 150)))
}

test('100-item Luna grid retains focused row through virtual scroll reinsertion', async t => {
  const f = await fixture(t, true, 100)
  const item = f.item()
  item.focus()
  await scrollGrid(f, 100)
  assert.equal(item.isConnected, true)
  assert.equal(document.activeElement === item, true, 'focus remains on original row')
})

test('virtual scroll moves evicted row focus to a visible row without growing the rendered range', async t => {
  const f = await fixture(t, true, 100)
  const item = f.item()
  item.focus()
  await scrollGrid(f, 1400)
  assert.equal(item.isConnected, false)
  const active = document.activeElement
  assert.ok(active.hasAttribute('data-application-item'), 'focus transfers to an application row')
  const index = Number(active.dataset.applicationItem.replace('com.example.app', ''))
  assert.ok(index >= 70 && index < 90, 'replacement focus is in the viewport, not only overscan')
  assert.ok(f.host.querySelectorAll('[data-application-item]').length < 100, 'virtualization stays bounded')
  assert.equal(f.host.querySelector('.luna-data-grid-data-container').scrollTop, 1400)
})

test('virtual grid rendering never steals focus from an open details drawer', async t => {
  const f = await fixture(t, true, 100)
  f.item().focus()
  await act(async () => f.item().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  const active = document.activeElement
  assert.ok(f.host.querySelector('[role="dialog"]').contains(active))
  await scrollGrid(f, 1400)
  assert.equal(document.activeElement, active)
})
