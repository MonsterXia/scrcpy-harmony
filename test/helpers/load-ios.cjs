const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
module.exports = function load(file, mocks = {}) {
  const module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, Buffer, process, console, URL, AbortController, AbortSignal,
    setTimeout, clearTimeout, setInterval, clearInterval, Uint8Array,
    require(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id]
      if (id.endsWith('.json')) return require(path.resolve(path.dirname(file),id))
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'), mocks)
      return require(id)
    },
  }, { filename: file })
  return module.exports
}
