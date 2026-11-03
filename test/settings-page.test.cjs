const assert = require('node:assert/strict')
const { test } = require('node:test')
const { observable, runInAction } = require('mobx')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup(),
  { act } = React
async function fixture(t) {
  const writes = [],
    picks = [],
    restarts = []
  const settings = observable({
    language: 'system',
    theme: 'light',
    hdcPath: '/old/hdc',
    killHdcWhenExit: false,
    betaUpdate: false,
    set(name, value) {
      return new Promise((resolve, reject) =>
        writes.push({ name, value, resolve, reject }),
      )
    },
  })
  const main = {
    showOpenDialog: () =>
      new Promise((resolve, reject) => picks.push({ resolve, reject })),
    relaunch: () => restarts.push(true),
  }
  const View = load(
    'src/renderer/main/components/settings/SettingsContent.tsx',
    { '../../store': { settings }, 'common/util': { t: (key) => key } },
    { main },
  ).default
  const host = document.body.appendChild(document.createElement('div')),
    root = createRoot(host)
  await act(async () => root.render(React.createElement(View)))
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  return { host, settings, writes, picks, restarts }
}
test('settings saves explicit language values with pending and failure recovery', async (t) => {
  const f = await fixture(t),
    language = f.host.querySelector('[aria-label="language"]')
  assert.deepEqual(
    [...language.options].map((o) => o.value),
    ['system', 'en-US', 'zh-CN'],
  )
  await act(async () => {
    language.value = 'zh-CN'
    language.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  assert.equal(f.writes[0].name, 'language')
  assert.equal(f.writes[0].value, 'zh-CN')
  assert.ok(language.disabled)
  await act(async () => f.writes[0].reject(Error('disk failed')))
  assert.equal(language.disabled, false)
  assert.equal(language.value, 'system')
  assert.equal(
    f.host.querySelector('[role="alert"]').textContent,
    'settingsSaveFailed',
  )
  await act(async () => {
    language.value = 'en-US'
    language.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  await act(async () => {
    runInAction(() => (f.settings.language = 'en-US'))
    f.writes[1].resolve()
  })
  assert.equal(f.host.querySelector('[role="alert"]'), null)
  assert.equal(
    f.host.querySelector('[role="status"]').textContent,
    'requireReload',
  )
  assert.deepEqual(f.restarts, [])
  await act(async () =>
    [...f.host.querySelectorAll('button')]
      .find((b) => b.textContent === 'restartApp')
      .click(),
  )
  assert.equal(f.restarts.length, 1)
})
test('HDC path picker handles cancellation and failure; valid selection persists through the settings store', async (t) => {
  const f = await fixture(t),
    browse = [...f.host.querySelectorAll('button')].find(
      (b) => b.textContent === 'browse',
    )
  await act(async () => browse.click())
  await act(async () => f.picks[0].resolve({ canceled: true, filePaths: [] }))
  assert.equal(f.writes.length, 0)
  await act(async () => browse.click())
  await act(async () => f.picks[1].reject(Error('dialog failed')))
  assert.equal(
    f.host.querySelector('[role="alert"]').textContent,
    'workspaceBrowseFailed',
  )
  await act(async () => browse.click())
  await act(async () =>
    f.picks[2].resolve({ canceled: false, filePaths: ['/new/hdc'] }),
  )
  assert.equal(f.writes[0].name, 'hdcPath')
  assert.equal(f.writes[0].value, '/new/hdc')
  assert.ok(browse.disabled)
  await act(async () => {
    runInAction(() => (f.settings.hdcPath = '/new/hdc'))
    f.writes[0].resolve()
  })
  assert.equal(f.host.querySelector('input').value, '/new/hdc')
  assert.equal(f.host.querySelector('[role="alert"]'), null)
})
test('Beta and HDC exit controls use the same persisted store and follow external updates', async (t) => {
  const f = await fixture(t),
    checks = f.host.querySelectorAll('[type="checkbox"]')
  await act(async () => checks[1].click())
  assert.equal(f.writes[0].name, 'betaUpdate')
  assert.equal(f.writes[0].value, true)
  await act(async () => {
    runInAction(() => (f.settings.betaUpdate = true))
    f.writes[0].resolve()
  })
  assert.equal(checks[1].checked, true)
  await act(async () => runInAction(() => (f.settings.betaUpdate = false)))
  assert.equal(checks[1].checked, false)
  await act(async () => checks[0].click())
  assert.equal(f.writes[1].name, 'killHdcWhenExit')
  assert.equal(f.writes[1].value, true)
  await act(async () => f.writes[1].resolve())
})
test('App keeps application settings mounted across device changes and no-device startup', async (t) => {
  const store = observable({
    panel: 'settings',
    ready: false,
    target: null,
    selectPanel(id) {
      this.panel = id
    },
  })
  let mounts = 0
  function Settings() {
    React.useEffect(() => {
      mounts++
    }, [])
    return React.createElement('input', { defaultValue: 'draft' })
  }
  const mocks = {
    './store': store,
    '../lib/useHapDrop': () => {},
    './components/workspace/Workspace': ({ children }) =>
      React.createElement('div', null, children),
    './components/settings/SettingsContent': Settings,
    './components/common/loading': {
      PannelLoading: () =>
        React.createElement('div', { 'data-device-loading': true }),
    },
  }
  for (const [dir, name] of [
    ['overview', 'Overview'],
    ['application', 'Application'],
    ['process', 'Process'],
    ['shell', 'Shell'],
    ['layout', 'Layout'],
    ['screenshot', 'Screenshot'],
    ['hilog', 'Hilog'],
    ['webview', 'Webview'],
  ])
    mocks[`./components/${dir}/${name}`] = () => null
  const App = load('src/renderer/main/App.tsx', mocks).default
  const host = document.body.appendChild(document.createElement('div')),
    root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(React.createElement(App)))
  const input = host.querySelector('input')
  input.value = 'unsaved path'
  assert.equal(mounts, 1)
  assert.equal(!!host.querySelector('[data-device-loading]'), false)
  await act(async () =>
    runInAction(() => {
      store.ready = true
      store.target = { key: 'A' }
    }),
  )
  await act(async () => runInAction(() => (store.target = { key: 'B' })))
  assert.equal(host.querySelector('input'), input)
  assert.equal(input.value, 'unsaved path')
  assert.equal(mounts, 1)
})
