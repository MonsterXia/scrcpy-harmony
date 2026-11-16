const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { transformSync } = require('esbuild')

function fixture() {
  class Window extends EventEmitter {
    constructor() { super(); this.destroyed = false; this.shows = 0; this.webContents = { send() {} } }
    isDestroyed() { return this.destroyed }
    isFullScreen() { if (this.destroyed) throw Error('Object has been destroyed'); return false }
    show() { if (this.destroyed) throw Error('Object has been destroyed'); this.shows++ }
    setMenu() {}
    destroy() { this.destroyed = true; this.emit('closed') }
  }
  const mocks = {
    electron: { BrowserWindow: Window },
    'custom-electron-titlebar/main': {},
    'common/theme': { colorBgContainer: '#fff', colorBgContainerDark: '#000' },
    './util': { getTheme: () => 'light' },
    '../../common/util': { isDev: () => false },
    '../../common/log': () => ({ debug() {}, info() {} }),
    './store': { getWindowStore: () => ({ get() {}, set() {} }) },
  }
  const module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync('src/share/main/lib/window.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    { module, exports: module.exports, __dirname, setTimeout, clearTimeout,
      require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id) })
  return module.exports
}

test('a queued window position save does not access a destroyed native window', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const api = fixture(); let saved = 0
  const win = api.create({ name: 'test', titlebar: false, preload: false, onSavePos: () => saved++ })
  win.emit('ready-to-show'); win.emit('resize'); win.destroy()
  assert.doesNotThrow(() => t.mock.timers.tick(1001))
  assert.equal(saved, 0)
  assert.equal(api.getWin('test'), undefined)
})

test('closing before ready prevents the fallback from showing a destroyed window', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const api = fixture()
  const win = api.create({ name: 'early-close', titlebar: false, preload: false, onSavePos() {} })
  win.destroy()
  assert.doesNotThrow(() => t.mock.timers.tick(1001))
  assert.equal(win.shows, 0)
})

test('a live window still appears and persists its position after resize', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const api = fixture(); let saved = 0
  const win = api.create({ name: 'live', titlebar: false, preload: false, onSavePos: () => saved++ })
  t.mock.timers.tick(1001); win.emit('resize'); t.mock.timers.tick(1001)
  assert.equal(win.shows, 1); assert.equal(saved, 1)
  win.destroy()
})
