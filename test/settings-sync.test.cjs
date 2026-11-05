const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setup, load } = require('./helpers/workspace-renderer.cjs')
setup()
function fixture() {
  const reads = [],
    writes = [],
    listeners = {}
  const main = {
    on: (name, fn) => {
      listeners[name] = fn
      return () => {}
    },
    getSettingsStore: (key) =>
      new Promise((resolve) => reads.push({ key, resolve })),
    setSettingsStore: (key, value) =>
      new Promise((resolve, reject) =>
        writes.push({ key, value, resolve, reject }),
      ),
  }
  const Settings = load(
    'src/renderer/main/store/settings.ts',
    {
      'share/common/i18n': {
        resolveLocale: (value) =>
          ['en-US', 'zh-CN'].includes(value) ? value : undefined,
      },
    },
    { main },
  ).Settings
  return { settings: new Settings(), reads, writes, listeners }
}
test('settings receives external Beta changes and ignores an older initialization reply', async () => {
  const f = fixture()
  assert.equal(typeof f.listeners.changeSettingsStore, 'function')
  f.listeners.changeSettingsStore('betaUpdate', true)
  for (let i = 0; i < 6; i++) {
    const r = f.reads[i]
    if (r) {
      r.resolve(r.key === 'betaUpdate' ? false : undefined)
      await Promise.resolve()
      await Promise.resolve()
    }
  }
  assert.equal(f.settings.betaUpdate, true)
})
test('settings only publishes successful saves and newer external state wins', async () => {
  const f = fixture()
  const task = f.settings.set('theme', 'dark')
  f.writes[0].reject(new Error('disk'))
  await assert.rejects(task, /disk/)
  assert.equal(f.settings.theme, 'light')
  const save = f.settings.set('betaUpdate', true)
  f.listeners.changeSettingsStore('betaUpdate', false)
  f.writes[1].resolve()
  await save
  assert.equal(f.settings.betaUpdate, false)
})
test('main window forwards settings changes once and retains existing invoke handlers', () => {
  const handlers = new Map(),
    listeners = [],
    sent = [],
    writes = []
  const settings = {
    get: (key) => key === 'betaUpdate',
    set: (...args) => writes.push(args),
    on: (name, fn) => listeners.push(fn),
  }
  const api = load('src/main/window/main.ts', {
    electron: {
      app: { on() {}, quit() {} },
      session: { defaultSession: { webRequest: { onBeforeSendHeaders() {} } } },
    },
    '../lib/store': {
      getMainStore: () => ({ on() {}, get() {}, set() {} }),
      getSettingsStore: () => settings,
    },
    'share/main/lib/util': {
      handleEvent: (name, fn) => handlers.set(name, fn),
    },
    'share/main/lib/window': {
      create: () => ({ on() {}, focus() {} }),
      loadPage() {},
      sendAll: (...args) => sent.push(args),
    },
    '../lib/devices': { startSelected() {}, mirrorSessions: { list: () => [] } },
    './screencast': { showWin() {}, closeWin() {} },
    'share/common/log': () => ({ info() {} }),
  })
  api.showWin()
  api.showWin()
  assert.equal(listeners.length, 1)
  listeners[0]('betaUpdate', true)
  assert.deepEqual(sent, [['changeSettingsStore', 'betaUpdate', true]])
  assert.equal(handlers.get('getSettingsStore')('betaUpdate'), true)
  handlers.get('setSettingsStore')('theme', 'dark')
  assert.deepEqual(writes, [['theme', 'dark']])
})
