const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { transformSync } = require('esbuild')

test('native edit commands route to the screencast but keep other windows native', () => {
  const file = 'src/main/lib/screencastEdit.ts'
  assert.ok(fs.existsSync(file), 'native edit routing exists')
  const module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    { module, exports: module.exports })
  const calls = []
  const cast = { webContents: { send: (...args) => calls.push(args) } }
  const local = { webContents: { selectAll: () => calls.push('all'), delete: () => calls.push('delete') } }
  const edit = module.exports.editWindow
  const isCapture = contents => contents === cast.webContents
  edit('selectAll', cast.webContents, isCapture); edit('delete', cast.webContents, isCapture)
  edit('selectAll', local.webContents, isCapture); edit('delete', local.webContents, isCapture)
  edit('selectAll', undefined, isCapture)
  assert.deepEqual(calls, [['screencastEdit', 'selectAll'], ['screencastEdit', 'delete'], 'all', 'delete'])
})
