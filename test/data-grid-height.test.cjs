const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildSync } = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
const { setup } = require('./helpers/workspace-renderer.cjs')
setup()
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
global.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
global.HTMLElement = window.HTMLElement
global.Element = window.Element
global.requestAnimationFrame = callback => setTimeout(callback, 0)
global.cancelAnimationFrame = clearTimeout
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 200 })
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 800 })
window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 200, width: 800, height: 200 })
const filename = path.resolve('node_modules/luna-data-grid/esm/data-grid/index.js')
const result = buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs', write: false, define: { module: 'undefined' } })
const compiled = new Module(filename)
compiled.paths = require.resolve.paths('react')
compiled._compile(result.outputFiles[0].text, filename)
const DataGrid = compiled.exports.default
const tick = () => new Promise(resolve => setTimeout(resolve, 60))
function fixture(t, rowHeight) {
  const host = document.body.appendChild(document.createElement('div'))
  const grid = new DataGrid(host, { columns: [{ id: 'name', title: 'Name' }], rowHeight })
  grid.setData(Array.from({ length: 200 }, (_, id) => ({ name: String(id) })))
  t.after(() => { grid.destroy(); host.remove() })
  return { host, grid }
}
test('opt-in height drives virtual space, scrolled row offsets, cells and option changes together', async t => {
  const { host, grid } = fixture(t, 32)
  await tick()
  assert.equal(host.querySelector('.luna-data-grid-data-space').style.height, '6400px')
  assert.equal(host.style.getPropertyValue('--luna-data-grid-row-height'), '32px')
  const viewport = host.querySelector('.luna-data-grid-data-container')
  Object.defineProperty(viewport, 'scrollHeight', { value: 6400, configurable: true })
  viewport.scrollTop = 4000
  viewport.dispatchEvent(new window.Event('scroll'))
  // The engine first overscans during fast scrolling, then settles after 100ms.
  await new Promise(resolve => setTimeout(resolve, 180))
  const top = parseFloat(host.querySelector('.luna-data-grid-data').style.top)
  const first = +host.querySelector('.luna-data-grid-node').dataGridNode.data.name
  assert.ok(first > 80, 'virtualization must omit earlier offscreen records')
  assert.equal(top, first * 32, 'offset agrees with the actual first rendered record')
  grid.setOption('rowHeight', 28)
  await tick()
  assert.equal(host.querySelector('.luna-data-grid-data-space').style.height, '5600px')
  assert.equal(host.style.getPropertyValue('--luna-data-grid-row-height'), '28px')
  const changedTop = parseFloat(host.querySelector('.luna-data-grid-data').style.top)
  assert.equal(changedTop, +host.querySelector('.luna-data-grid-node').dataGridNode.data.name * 28)
})
test('default height remains 20 and nonfinite or out-of-bounds heights fall back safely', async t => {
  const { host, grid } = fixture(t)
  await tick()
  assert.equal(host.querySelector('.luna-data-grid-data-space').style.height, '4000px')
  for (const invalid of [0, -1, NaN, Infinity, 1000, '32']) {
    grid.setOption('rowHeight', invalid)
    await tick()
    assert.equal(grid.getOption('rowHeight'), 20)
    assert.equal(host.querySelector('.luna-data-grid-data-space').style.height, '4000px')
  }
})
