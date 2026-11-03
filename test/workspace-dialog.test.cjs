const assert = require('node:assert/strict')
const { test } = require('node:test')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup(),
  { act } = React
window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '')
}
window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open')
}
const mocks = { 'common/util': { t: (key) => key } }
const Dialog = load(
  'src/renderer/main/components/workspace/WorkspaceDialog.tsx',
  mocks,
).default
const Confirm = load(
  'src/renderer/main/components/workspace/ConfirmDialog.tsx',
  mocks,
).default
async function fixture(t, child) {
  const opener = document.body.appendChild(document.createElement('button'))
  opener.focus()
  const host = document.body.appendChild(document.createElement('div')),
    root = createRoot(host),
    closed = []
  const render = (visible) =>
    act(async () =>
      root.render(
        React.createElement(
          Dialog,
          { visible, title: 'Tools', onClose: () => closed.push(true) },
          child,
        ),
      ),
    )
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
    opener.remove()
  })
  await render(true)
  return { opener, host, closed, render }
}
test('workspace dialog traps focus, handles Escape and restores the opener', async (t) => {
  const f = await fixture(
    t,
    React.createElement('button', { 'data-last': true }, 'Action'),
  )
  const close = f.host.querySelector('[data-dialog-close]'),
    last = f.host.querySelector('[data-last]')
  assert.equal(document.activeElement, close)
  const tab = (node, shiftKey) =>
    node.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    )
  await act(async () => tab(close, true))
  assert.equal(document.activeElement, last)
  await act(async () => tab(last, false))
  assert.equal(document.activeElement, close)
  await act(async () =>
    close.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  assert.equal(f.closed.length, 1)
  await f.render(false)
  assert.equal(document.activeElement, f.opener)
})
test('nested confirmation consumes Escape to prevent the native parent dialog closing', async (t) => {
  const cancelled = []
  const f = await fixture(
    t,
    React.createElement(Confirm, {
      visible: true,
      title: 'Remove',
      message: 'port',
      onConfirm: () => {},
      onCancel: () => cancelled.push(true),
    }),
  )
  const event = new window.KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  })
  await act(async () =>
    f.host.querySelector('[data-confirm-cancel]').dispatchEvent(event),
  )
  assert.equal(cancelled.length, 1)
  assert.equal(f.closed.length, 0)
  assert.equal(event.defaultPrevented, true)
})
