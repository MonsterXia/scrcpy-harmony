const assert = require('node:assert/strict')
const { test } = require('node:test')
const { observable, runInAction } = require('mobx')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React
async function fixture(t, name = '<renderer>') {
  const item = { pid: 42, name, webContentsId: 3, type: 'Tab' }
  const store = observable({ processes: [item], process: item, theme: 'dark', filter: '', loading: false,
    setFilter(value) { this.filter = value }, refresh: async () => {} })
  const killed = [], inspected = []
  const Component = load('src/share/renderer/process/components/Toolbar.tsx', {
    'luna-toolbar/react': { __esModule: true, default: ({children}) => React.createElement('div', null, children), LunaToolbarInput: () => React.createElement('input'), LunaToolbarText: () => null, LunaToolbarSpace: () => null, LunaToolbarSeparator: () => null },
    '../../components/ToolbarIcon': () => React.createElement('span'), 'luna-modal': { confirm: async () => false },
    '../../common/i18n': { t: key => key },
    '../store': store, '../../../common/i18n': { t: (key, values) => values?.name ? `${key}: ${values.name}` : key },
    '../../../common/util': { isDev: () => false },
  }, { main: { killProcess: async pid => killed.push(pid), openDevtools: id => inspected.push(id) } }).default
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  await act(async () => root.render(React.createElement(Component)))
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  const button = key => [...host.querySelectorAll('button')].find(button => button.textContent === key)
  return { host, store, killed, inspected, button }
}
test('auxiliary process actions use keyboard controls and literal, cancellable confirmation', async t => {
  const f = await fixture(t)
  assert.ok(f.host.querySelector('input[type="search"][aria-label]'))
  await act(async () => f.button('inspect').click())
  assert.deepEqual(f.inspected, [3])
  f.button('stop').focus()
  await act(async () => f.button('stop').click())
  let dialog = f.host.querySelector('[role="alertdialog"]')
  assert.ok(dialog)
  assert.ok(dialog.textContent.includes('<renderer>'))
  assert.equal(dialog.querySelector('renderer'), null)
  assert.ok(dialog.contains(document.activeElement))
  await act(async () => dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(f.killed.length, 0)
  assert.equal(document.activeElement, f.button('stop'))
  await act(async () => f.button('stop').click())
  await act(async () => f.host.querySelector('[data-confirm-accept]').click())
  assert.deepEqual(f.killed, [42])
})
test('disappearing auxiliary process cannot be killed after an open confirmation', async t => {
  const f = await fixture(t)
  await act(async () => f.button('stop').click())
  await act(async () => runInAction(() => { f.store.processes = []; f.store.process = null }))
  await act(async () => f.host.querySelector('[data-confirm-accept]').click())
  assert.deepEqual(f.killed, [])
})

test('long process confirmation exposes a keyboard-scrollable message without moving default cancel focus', async t => {
  const name = '<long title> ' + 'very long process title '.repeat(250)
  const f = await fixture(t, name)
  f.button('stop').focus()
  await act(async () => f.button('stop').click())
  const dialog = f.host.querySelector('[role="alertdialog"]')
  const message = dialog.querySelector('[role="region"][tabindex="0"]')
  assert.ok(message, 'the message has its own keyboard scroll target')
  assert.ok(message.textContent.includes(name))
  const cancel = dialog.querySelector('[data-confirm-cancel]')
  const accept = dialog.querySelector('[data-confirm-accept]')
  assert.equal(document.activeElement, cancel, 'long content must not replace the safe default')
  accept.focus()
  await act(async () => accept.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
  assert.equal(document.activeElement, message)
  await act(async () => message.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
  assert.equal(document.activeElement, accept)
  await act(async () => message.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(f.host.querySelector('[role="alertdialog"]'), null)
  assert.equal(document.activeElement, f.button('stop'))
  assert.deepEqual(f.killed, [])
})
