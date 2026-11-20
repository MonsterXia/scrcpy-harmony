const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const load = require('./helpers/load-automation.cjs')

function fixture() {
  let id = 0,
    host
  const children = () => {
    const all = new Set()
    return {
      all,
      addChildView(view) {
        assert.equal(view.parent, undefined)
        view.parent = this
        all.add(view)
      },
      removeChildView(view) {
        assert.ok(all.delete(view))
        view.parent = undefined
      },
    }
  }
  function makeWindow() {
    const win = new EventEmitter()
    let bounds = { x: 0, y: 0, width: 735, height: 750 }
    return Object.assign(win, {
      id: ++id,
      contentView: children(),
      visible: true,
      isDestroyed: () => !!win.destroyed,
      getBounds: () => bounds,
      getContentBounds: () => ({
        width: bounds.width,
        height: bounds.height - 32,
      }),
      getContentSize: () => [bounds.width, bounds.height - 32],
      setBounds(b) {
        bounds = b
        win.emit('resize')
      },
      setMinimumSize() {},
      isAlwaysOnTop: () => !!win.pinned,
      setAlwaysOnTop: (value) => {
        win.pinned = value
      },
      setTitle() {},
      isMinimized: () => false,
      isMaximized: () => false,
      isFullScreen: () => false,
      hide() {
        win.visible = false
      },
      show() {
        win.visible = true
        win.emit('show')
      },
      focus() { win.focused = true },
      close() {
        win.emit('close')
        win.destroyed = true
        win.emit('closed')
      },
    })
  }
  const api = load('src/main/window/mergedMirrors.ts', {
    electron: {
      screen: {
        getDisplayMatching: () => ({
          workArea: { x: 0, y: 0, width: 1280, height: 800 },
        }),
      },
    },
    'share/main/lib/window': { create: () => (host = makeWindow()) },
  })
  function source(platform) {
    const window = makeWindow(),
      webContents = Object.assign(new EventEmitter(), {
        isDestroyed: () => false,
        focus() { this.focused = true },
        send(_event, value, inset) {
          this.label = value
          this.toolInset = inset
        },
      })
    const view = {
      webContents,
      setBounds(rect) {
        this.rect = rect
      },
      setVisible(value) {
        this.visible = value
      },
    }
    window.mirrorView = view
    window.syncMirrorTitlebar = () => {
      assert.equal(view.parent, window.contentView)
      assert.equal(window.mirrorHost, undefined)
      window.syncedTitlebar = true
    }
    window.mirrorRatio = 0.5
    window.contentView.addChildView(view)
    return { window, view, platform, deviceKey: platform + window.id }
  }
  return {
    ...api,
    source,
    get host() {
      return host
    },
  }
}

test('merge moves each original interactive document, preserves separate same-platform tiles and restores ownership', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const f = fixture(),
    sources = ['harmony', 'ios', 'android', 'android'].map(f.source)
  f.showMergedMirrors(() => sources)
  assert.equal(f.host.contentView.all.size, 4)
  for (const s of sources) {
    assert.equal(s.window.visible, false)
    s.window.show()
    assert.equal(s.window.visible, false)
    assert.equal(s.view.parent, f.host.contentView)
    assert.equal(s.window.contentView.all.size, 0)
  }
  assert.deepEqual(
    sources.map((s) => s.view.webContents.label),
    ['HarmonyOS', 'iOS', 'Android', 'Android'],
  )
  assert.ok(
    sources[2].view.rect.x < sources[3].view.rect.x &&
      sources[3].view.rect.x < sources[0].view.rect.x,
  )
  const rects = sources.map(s => s.view.rect).sort((a, b) => a.x - b.x)
  const [width, height] = f.host.getContentSize()
  assert.equal(height, Math.round((width - 3 * 12) / 2) + 32)
  for (const source of sources) assert.equal(source.view.rect.y + source.view.webContents.toolInset, 0)
  assert.equal(rects[0].x, 0)
  assert.equal(rects.at(-1).x + rects.at(-1).width, width)
  assert.ok(rects.every(rect => rect.y + rect.height === height))
  for (let i = 1; i < rects.length; i++) assert.equal(rects[i].x - rects[i-1].x - rects[i-1].width, 12)
  const removed = sources.pop()
  t.mock.timers.tick(250)
  assert.equal(removed.view.parent, removed.window.contentView)
  assert.equal(removed.window.visible, true)
  assert.equal(removed.window.syncedTitlebar, true)
  f.host.close()
  for (const s of sources) {
    assert.equal(s.view.parent, s.window.contentView)
    assert.equal(s.view.webContents.label, '')
    assert.equal(s.window.visible, true)
    assert.equal(s.window.syncedTitlebar, true)
  }
})

test('aspect changes refit the group and full-screen tools expand only their own view', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const f = fixture(),
    a = f.source('ios'),
    b = f.source('harmony')
  f.showMergedMirrors(() => [a, b])
  b.window.setAlwaysOnTop(true)
  t.mock.timers.tick(250)
  assert.equal(f.host.isAlwaysOnTop(), true)
  const oldHeight = f.host.getBounds().height
  a.window.mirrorRatio = 2
  t.mock.timers.tick(250)
  assert.ok(f.host.getBounds().height < oldHeight)
  a.view.webContents.emit('enter-html-full-screen')
  assert.equal(b.view.visible, false)
  assert.equal(a.view.rect.width, f.host.getContentSize()[0])
  a.view.webContents.emit('leave-html-full-screen')
  assert.equal(b.view.visible, true)
  assert.ok(a.view.rect.width < f.host.getContentSize()[0])
  f.closeMergedMirrors()
})

test('opening another device focuses its live tile after leaving the previous tile fullscreen', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const f = fixture(), first = f.source('harmony'), next = f.source('android')
  const sources = [first]
  f.showMergedMirrors(() => sources)
  first.view.webContents.emit('enter-html-full-screen')
  sources.push(next)
  assert.equal(f.getMergedMirrorWindow(next.deviceKey), f.host)
  assert.equal(next.view.visible, false)
  let finish
  first.view.webContents.executeJavaScript = () => new Promise(resolve => { finish = resolve })
  const focused = next.window.focusMirrorTile()
  assert.equal(f.host.focused, true)
  assert.equal(next.view.webContents.focused, undefined)
  first.view.webContents.emit('leave-html-full-screen')
  finish()
  await focused
  assert.equal(next.view.visible, true)
  assert.equal(next.view.webContents.focused, true)
  assert.equal(next.window.visible, false)
  f.closeMergedMirrors()
  assert.equal(next.window.focusMirrorTile, undefined)
})
