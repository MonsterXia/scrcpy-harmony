const assert = require('node:assert/strict')
const { test } = require('node:test')
const { observable, runInAction } = require('mobx')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React

async function fixture(t) {
  const selected = [], pending = [], notices = [], opened = []
  const store = observable({
    theme: 'light', panel: 'application', ready: true,
    targets: [], target: null, targetsError: false,
    selectPanel(id) { this.panel = id; selected.push(id) },
    selectTarget(key) { this.target = this.targets.find(d => d.key === key) },
    refreshTargets() { return new Promise((resolve, reject) => pending.push({ resolve, reject })) },
  })
  const Workspace = load('src/renderer/main/components/workspace/Workspace.tsx', {
    '../../store': store,
    'common/util': { t: key => key },
    'share/renderer/lib/util': { notify: (...args) => notices.push(args) },
  }, { main: { showScreencast: () => opened.push('screencast') } }).default
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  await act(async () => root.render(React.createElement(Workspace,
    { onOpenSettings: () => opened.push('settings') }, React.createElement('div', null, 'page content'))))
  return { store, host, selected, pending, notices, opened, unmount: () => root.unmount() }
}

test('workspace keeps eight panel IDs, allows settings without a device and disables mirroring', async t => {
  const f = await fixture(t)
  const buttons = [...f.host.querySelectorAll('button[data-navigation]')]
  assert.equal(buttons.length, 8)
  assert.equal(f.host.querySelector('[data-action="screencast"]').disabled, true)
  await act(async () => f.host.querySelector('[data-action="settings"]').click())
  assert.deepEqual(f.opened, ['settings'])
  await act(async () => buttons.find(b => b.dataset.navigation === 'shell').click())
  assert.equal(f.store.panel, 'shell')
  assert.ok(f.host.querySelector('header').textContent.startsWith('workspaceDebugging'))
  assert.equal(f.host.querySelector('[aria-current="page"]').dataset.navigation, 'shell')
})

test('device picker preserves network keys, refresh is single-flight and failure stays distinct from empty', async t => {
  const f = await fixture(t)
  await act(async () => runInAction(() => {
    f.store.targets = [{ key: '127.0.0.1:45678', name: 'A long device name' }, { key: 'usb-key', name: 'Second' }]
    f.store.target = f.store.targets[0]
  }))
  const select = f.host.querySelector('select')
  assert.equal(select.value, '127.0.0.1:45678')
  await act(async () => { select.value = 'usb-key'; select.dispatchEvent(new window.Event('change', { bubbles: true })) })
  assert.equal(f.store.target.key, 'usb-key')
  const refresh = f.host.querySelector('[data-action="refresh-devices"]')
  await act(async () => { refresh.click(); refresh.click() })
  assert.equal(f.pending.length, 1)
  assert.equal(refresh.disabled, true)
  await act(async () => { runInAction(() => { f.store.targets = []; f.store.target = null; f.store.targetsError = true }); f.pending[0].resolve(false) })
  assert.equal(refresh.disabled, false)
  assert.ok(f.host.textContent.includes('targetRefreshFailed'))
  assert.equal(f.notices[0][1].icon, 'error')
  await act(async () => runInAction(() => { f.store.targetsError = false }))
  assert.ok(f.host.textContent.includes('targetNotConnected'))
})

test('device selector consumes a rejected refresh and permits retry', async t => {
  const f = await fixture(t)
  const refresh = f.host.querySelector('[data-action="refresh-devices"]')
  await act(async () => refresh.click())
  await act(async () => f.pending[0].reject(new Error('IPC disconnected')))
  assert.equal(refresh.disabled, false)
  assert.equal(f.notices[0][1].icon, 'error')
  await act(async () => refresh.click())
  assert.equal(f.pending.length, 2)
  await act(async () => f.pending[1].resolve(true))
})

for (const result of ['resolve', 'reject']) {
  test(`unmounted device selector ignores late refresh ${result}`, async t => {
    const f = await fixture(t)
    await act(async () => f.host.querySelector('[data-action="refresh-devices"]').click())
    await act(async () => f.unmount())
    await act(async () => f.pending[0][result](result === 'resolve' ? true : new Error('late IPC')))
    assert.deepEqual(f.notices, [])
    assert.equal(f.host.childElementCount, 0)
  })
}
