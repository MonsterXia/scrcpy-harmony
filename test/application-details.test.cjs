const assert = require('node:assert/strict')
const { test } = require('node:test')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React

async function fixture(t) {
  const origin = document.body.appendChild(document.createElement('button'))
  origin.textContent = 'Open details'
  origin.focus()
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  const info = { bundleName: 'com.example.app', label: 'Example', icon: '', system: false,
    versionName: '1.0', apiTargetVersion: 20, vendor: 'Vendor', installTime: 0, releaseType: 'Release', mainAbility: 'EntryAbility' }
  const Details = load('src/renderer/main/components/application/BundleInfoModal.tsx', {
    'common/util': { t: key => key },
    'licia/copy': () => {},
    'share/renderer/lib/util': { notify() {} },
    '../../../assets/default-icon.png': 'default.png',
    'luna-modal/react': ({children}) => React.createElement('div', null, children),
    '../common/Copyable': { Copyable: ({ children }) => React.createElement('span', null, children) },
  }).default
  let closes = 0
  function Harness() {
    const [visible, setVisible] = React.useState(true)
    return React.createElement(Details, { bundleInfo: info, visible, busy: false,
      onAction() {}, onClose: () => { closes++; setVisible(false) } })
  }
  await act(async () => root.render(React.createElement(Harness)))
  t.after(async () => { await act(async () => root.unmount()); host.remove(); origin.remove() })
  return { host, origin, closes: () => closes }
}

test('application details traps keyboard focus and Escape restores its opener', async t => {
  const f = await fixture(t)
  const dialog = f.host.querySelector('[role="dialog"]')
  assert.ok(dialog, 'details is a locally mounted dialog')
  assert.equal(dialog.getAttribute('aria-modal'), 'true')
  assert.ok(dialog.contains(document.activeElement))
  const controls = [...dialog.querySelectorAll('button:not(:disabled)')]
  controls.at(-1).focus()
  await act(async () => controls.at(-1).dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
  assert.equal(document.activeElement, controls[0])
  await act(async () => dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(f.closes(), 1)
  assert.equal(f.host.querySelector('[role="dialog"]'), null)
  assert.equal(document.activeElement, f.origin)
})
