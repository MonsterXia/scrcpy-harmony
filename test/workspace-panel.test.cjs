const assert = require('node:assert/strict')
const { test } = require('node:test')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React

test('visited panel stays mounted and hidden panel cannot receive keyboard focus', async t => {
  const Panel = load('src/renderer/main/components/workspace/Panel.tsx').default
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  let mounts = 0, cleanups = 0
  function Session() {
    React.useEffect(() => { mounts++; return () => cleanups++ }, [])
    return React.createElement('input', { defaultValue: 'session content' })
  }
  const render = (active, device = 'a') => act(async () => root.render(
    React.createElement(Panel, { key: device, id: 'shell', active }, React.createElement(Session)),
  ))
  await render(false)
  assert.equal(mounts, 0)
  await render(true)
  const input = host.querySelector('input')
  input.value = 'unsubmitted command'
  assert.equal(mounts, 1)
  await render(false)
  assert.equal(host.querySelector('input'), input)
  assert.equal(host.querySelector('[inert]').getAttribute('aria-hidden'), 'true')
  assert.equal(cleanups, 0)
  await render(true)
  assert.equal(host.querySelector('[inert]'), null)
  assert.equal(host.querySelector('input').value, 'unsubmitted command')
  assert.equal(mounts, 1)
  await render(true, 'b')
  assert.equal(cleanups, 1)
  assert.equal(mounts, 2)
  assert.equal(host.querySelector('input').value, 'session content')
})
