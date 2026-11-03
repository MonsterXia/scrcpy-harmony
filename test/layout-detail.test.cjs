const assert = require('node:assert/strict')
const { test } = require('node:test')
const { DOMParser } = require('@xmldom/xmldom')
const { setup, load, React } = require('./helpers/workspace-renderer.cjs')
const createRoot = setup()
const { act } = React

test('layout properties expose literal attribute values through native copy controls', async (t) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host),
    copied = []
  const node = new DOMParser().parseFromString(
    '<Node text="&lt;external&gt;" enabled="true" />',
    'text/xml',
  ).documentElement
  const Detail = load('src/renderer/main/components/layout/Detail.tsx', {
    'common/util': { t: (key) => key },
    'licia/copy': (value) => copied.push(value),
    '../common/Copyable': {
      Copyable: ({ children }) => React.createElement('div', null, children),
    },
  }).default
  await act(async () =>
    root.render(React.createElement(Detail, { selected: node })),
  )
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const value = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === '<external>',
  )
  assert.ok(value, 'copying a property is a keyboard reachable native button')
  await act(async () => value.click())
  assert.deepEqual(copied, ['<external>'])
  assert.equal(host.querySelector('external'), null)
})
