const { buildSync } = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
module.exports = function load(file, mocks = {}) {
  const filename = path.resolve(file)
  const code = buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs', write: false, external: Object.keys(mocks) }).outputFiles[0].text
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const originalRequire = mod.require.bind(mod)
  mod.require = id => Object.hasOwn(mocks, id) ? mocks[id] : originalRequire(id)
  mod._compile(code, filename)
  return mod.exports
}
