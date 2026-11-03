const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const { JSDOM } = require('jsdom')
const React = require('react')

function setup() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  global.window = dom.window
  global.document = dom.window.document
  global.getComputedStyle = dom.window.getComputedStyle
  global.IS_REACT_ACT_ENVIRONMENT = true
  return require('react-dom/client').createRoot
}

// Execute production React modules; replace only IPC and unrelated widget boundaries.
function load(file, mocks = {}, globals = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '../..', file)
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }
  cache.set(filename, module)
  vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), {
    loader: filename.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic',
  }).code, {
    module, exports: module.exports, window, document, console,
    setTimeout, clearTimeout, ...globals,
    require(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id]
      if (id.endsWith('.scss')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key })
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), id)
        const resolved = ['.tsx', '.ts', '/index.ts'].map(ext => base + ext).find(fs.existsSync)
        if (!resolved) throw new Error(`Missing module ${id} in ${filename}`)
        return load(resolved, mocks, globals, cache)
      }
      return require(id)
    },
  }, { filename })
  return module.exports
}

module.exports = { setup, load, React }
