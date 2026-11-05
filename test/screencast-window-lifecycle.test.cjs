const assert = require('node:assert/strict')
const { test } = require('node:test')
const { screencastMain } = require('./helpers/screencast-main.cjs')

test('show focuses the existing live screencast window', () => {
  const h = screencastMain()
  h.show()
  h.show()
  assert.equal(h.windows.length, 1)
  assert.equal(h.windows[0].focuses, 1)
})

test('normal close restores main and permits reopening', () => {
  const h = screencastMain()
  h.show()
  h.close()
  assert.equal(h.mainShows(), 1)
  h.show()
  assert.equal(h.windows.length, 2)
})

test('direct destruction restores main without requiring a close event', () => {
  const h = screencastMain()
  h.show()
  h.windows[0].destroy()
  assert.equal(h.mainShows(), 1)
})

test('direct destruction releases the singleton so show creates a fresh window', () => {
  const h = screencastMain()
  h.show()
  h.windows[0].destroy()
  h.show()
  assert.equal(h.windows.length, 2)
})

test('repeated close after destruction is harmless and does not restore main twice', () => {
  const h = screencastMain()
  h.show()
  h.windows[0].destroy()
  h.close()
  h.close()
  assert.equal(h.mainShows(), 1)
})

test('different Harmony devices keep independent windows and sender-bound targets', async () => {
  const h = screencastMain()
  const a = { key: 'phone-a', name: 'Same name', ohosVersion: '', sdkVersion: '' }
  const b = { ...a, key: 'phone-b' }
  h.show(a)
  h.show(b)
  assert.equal(h.windows.length, 2)
  assert.equal((await h.invoke('getScreencastTarget', [], h.windows[0])).key, 'phone-a')
  assert.equal((await h.invoke('getScreencastTarget', [], h.windows[1])).key, 'phone-b')
  h.show(a)
  assert.equal(h.windows[0].focuses, 1)
  await h.invoke('closeScreencast', [], h.windows[0])
  assert.equal(h.listSessions().length, 1)
  assert.equal(h.listSessions()[0].deviceKey, 'phone-b')
  h.close()
})

test('a second device does not invalidate the first capture owner', async () => {
  const h = screencastMain()
  h.addDriver('second-device')
  h.show()
  const first = h.windows[0]
  const firstSession = await h.create('synthetic-target', first)
  await h.startSession(firstSession, 0.5, 1, first)
  h.show({ key: 'second-device', name: 'Second', ohosVersion: '', sdkVersion: '' })
  const second = h.windows[1]
  const secondSession = await h.create('second-device', second)
  await h.startSession(secondSession, 0.5, 1, second)
  h.driver.emit('message', 'session', Buffer.from([1]))
  assert.equal(h.deliveries.at(-1).win, first)
  await h.stopSession(firstSession, first)
  assert.equal(h.listSessions().length, 2)
  await h.stopSession(secondSession, second)
  h.close()
})
