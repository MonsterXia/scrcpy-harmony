const assert = require('node:assert/strict')
const { test } = require('node:test')
const { observable, runInAction } = require('mobx')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup(),
  { act } = React
window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '')
}
window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open')
}
async function mount(t, file, store, main, extra = {}) {
  const host = document.body.appendChild(document.createElement('div')),
    root = createRoot(host),
    notices = []
  const View = load(
    file,
    {
      '../../store': store,
      'luna-modal/react': ({ children, visible }) =>
        visible ? React.createElement('div', null, children) : null,
      'common/util': { t: (key) => key },
      'share/renderer/lib/util': {
        notify: (...v) => notices.push(v),
        copyData: () => {},
      },
      ...extra,
    },
    { main },
  ).default
  await act(async () =>
    root.render(
      React.createElement(View, { visible: true, onClose: () => {} }),
    ),
  )
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  return { host, notices, unmount: () => act(async () => root.unmount()) }
}
test('remote uses keyboard buttons, keeps all key codes and consumes rejected inputs', async (t) => {
  const codes = [],
    store = observable({ target: { key: 'device' } })
  const f = await mount(
    t,
    'src/renderer/main/components/overview/RemoteControllerModal.tsx',
    store,
    {
      inputKey: async (_, code) => {
        codes.push(code)
        if (code === 18) throw Error('failed')
      },
    },
  )
  const buttons = [...f.host.querySelectorAll('[data-keycode]')]
  assert.equal(buttons.length, 11)
  for (const button of buttons) await act(async () => button.click())
  assert.deepEqual(
    codes.sort((a, b) => a - b),
    [-1, 1, 2, 16, 17, 18, 2012, 2013, 2014, 2015, 2016],
  )
  assert.equal(f.notices.length, 1)
  await act(async () => runInAction(() => (store.target = null)))
  assert.ok(buttons.every((button) => button.disabled))
})
async function screenshotFixture(t) {
  const reads = [],
    decodes = [],
    store = observable({ target: { key: 'A' } })
  const f = await mount(
    t,
    'src/renderer/main/components/screenshot/Screenshot.tsx',
    store,
    {
      screencap: (key) =>
        new Promise((resolve, reject) => reads.push({ key, resolve, reject })),
    },
    {
      'luna-toolbar/react': {
        __esModule: true,
        default: ({ children }) => React.createElement('div', null, children),
        LunaToolbarButton: ({ children }) =>
          React.createElement('div', null, children),
        LunaToolbarSeparator: () => null,
        LunaToolbarSpace: () => null,
        LunaToolbarText: () => null,
      },
      'share/renderer/components/ToolbarIcon': (props) =>
        React.createElement('button', {
          'data-action': props.icon === 'refresh' ? 'capture' : props.icon,
          disabled: props.disabled,
          onClick: props.onClick,
        }),
      'share/renderer/components/CopyButton': () => null,
      'luna-image-viewer/react': (props) =>
        React.createElement('img', { 'data-viewer': true, src: props.image }),
      'licia/loadImg': (url, callback) => decodes.push({ url, callback }),
    },
  )
  return { ...f, reads, decodes, store }
}
test('screenshot exposes pending state, consumes read failure and retries', async (t) => {
  const f = await screenshotFixture(t)
  assert.equal(f.host.querySelector('[aria-busy="true"]') !== null, true)
  await act(async () => f.reads[0].reject(Error('capture failed')))
  assert.ok(f.host.querySelector('[role="alert"]'))
  await act(async () => f.host.querySelector('[data-action="capture"]').click())
  assert.equal(f.reads.length, 2)
  await act(async () => f.reads[1].resolve('aGVsbG8='))
  await act(async () =>
    f.decodes[0].callback(null, { width: 360, height: 720 }),
  )
  assert.ok(f.host.querySelector('[data-viewer]'))
})
test('screenshot ignores old device capture and decode replies', async (t) => {
  const f = await screenshotFixture(t)
  await act(async () => f.reads[0].resolve('aGVsbG8='))
  assert.equal(f.decodes.length, 1)
  await act(async () => runInAction(() => (f.store.target = { key: 'B' })))
  assert.equal(f.reads.length, 2)
  await act(async () =>
    f.decodes[0].callback(null, { width: 360, height: 720 }),
  )
  assert.equal(f.host.querySelector('[data-viewer]'), null)
  await act(async () => f.reads[1].resolve('aGVsbG8='))
  await act(async () => f.decodes[1].callback(Error('bad image')))
  assert.ok(f.host.querySelector('[role="alert"]'))
})
test('remote allows a new device command while an old device input is pending', async (t) => {
  const calls = [],
    store = observable({ target: { key: 'A' } })
  const f = await mount(
    t,
    'src/renderer/main/components/overview/RemoteControllerModal.tsx',
    store,
    {
      inputKey: (key, code) =>
        new Promise((resolve, reject) =>
          calls.push({ key, code, resolve, reject }),
        ),
    },
  )
  await act(async () => f.host.querySelector('[data-keycode="1"]').click())
  await act(async () => runInAction(() => (store.target = { key: 'B' })))
  assert.equal(f.host.querySelector('[data-keycode="1"]').disabled, false)
  await act(async () => f.host.querySelector('[data-keycode="1"]').click())
  assert.equal(calls[1].key, 'B')
  await act(async () => calls[0].reject(Error('stale failure')))
  assert.deepEqual(f.notices, [])
  assert.equal(f.host.querySelector('[data-keycode="1"]').disabled, true)
  await act(async () => calls[1].resolve())
  assert.equal(f.host.querySelector('[data-keycode="1"]').disabled, false)
})
test('PNG conversion rejects image decoding failure instead of leaving copy pending', async () => {
  let image
  class TestImage {
    constructor() {
      image = this
    }
    set src(value) {
      this.source = value
    }
  }
  const { toPng } = load(
    'src/renderer/main/lib/util.ts',
    {},
    { Image: TestImage },
  )
  const pending = toPng('data:image/jpeg;base64,broken')
  assert.equal(typeof image.onerror, 'function')
  image.onerror(new Error('decode failed'))
  await assert.rejects(pending, /decode/i)
})
