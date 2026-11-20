const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { transformSync } = require('esbuild')

function fixture() {
  class Contents extends EventEmitter {
    messages = []
    send(...args) { this.messages.push(args) }
    focus() {}
    isDestroyed() { return !!this.closed }
    close() { this.closed = true }
  }
  class View {
    webContents = new Contents()
    setBounds() {}
  }
  class Window extends EventEmitter {
    constructor() { super(); this.destroyed = false; this.shows = 0; this.webContents = new Contents() }
    contentView = { addChildView() {} }
    getContentSize() { return [400, 600] }
    setMinimumSize() {}
    isDestroyed() { return this.destroyed }
    isMaximized() { return !!this.maximized }
    isFocused() { return !!this.focused }
    isFullScreen() { if (this.destroyed) throw Error('Object has been destroyed'); return !!this.fullscreen }
    show() { if (this.destroyed) throw Error('Object has been destroyed'); this.shows++ }
    setMenu() {}
    destroy() { this.destroyed = true; this.emit('closed') }
  }
  const mocks = {
    electron: { BrowserWindow: Window, WebContentsView: View },
    'custom-electron-titlebar/main': { attachTitlebarToWindow: win => { win.attachedTitlebar = true } },
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

test('detachable custom titlebars receive independent window events and restore state from their own window', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const api = fixture()
  const win = api.create({ name: 'mirror', detachable: true })
  const contents = win.mirrorView.webContents
  for (const event of ['enter-full-screen', 'leave-full-screen', 'maximize', 'unmaximize', 'focus', 'blur']) win.emit(event)
  assert.deepEqual(contents.messages.filter(([name]) => name.startsWith('window-')), [
    ['window-fullscreen', true], ['window-fullscreen', false], ['window-maximize', true],
    ['window-maximize', false], ['window-focus', true], ['window-focus', false],
  ])
  assert.deepEqual(win.webContents.messages, [])
  contents.messages.length = 0
  win.mirrorHost = {}
  win.emit('enter-full-screen'); win.emit('maximize'); win.emit('blur')
  contents.emit('did-finish-load')
  assert.deepEqual(contents.messages, [])
  win.mirrorHost = undefined
  win.fullscreen = false; win.maximized = true; win.focused = true
  win.syncMirrorTitlebar()
  assert.deepEqual(contents.messages, [
    ['window-fullscreen', false], ['window-maximize', true], ['window-focus', true],
  ])
  win.destroy()
  assert.doesNotThrow(() => contents.emit('did-finish-load'))
  assert.equal(api.create({ name: 'ordinary' }).attachedTitlebar, true)
})
