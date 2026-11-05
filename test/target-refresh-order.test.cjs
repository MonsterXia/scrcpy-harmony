const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')

function load(file, imports, main) {
  const module = { exports: {} }
  const { code } = transformSync(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    loader: file.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic',
  })
  vm.runInNewContext(code, {
    module, exports: module.exports, main, setTimeout: () => 0,
    require(id) {
      if (Object.hasOwn(imports, id)) return imports[id]
      if (id.startsWith('licia/') || ['mobx', 'react/jsx-runtime'].includes(id)) return require(id)
      throw new Error(`Unexpected import: ${id}`)
    },
  }, { filename: file })
  return module.exports
}

const target = (key) => ({ key, name: key, ohosVersion: '6.0', sdkVersion: '20' })
const copy = (value) => JSON.parse(JSON.stringify(value))
const tick = () => new Promise(setImmediate)

// Real Store, MobX and toolbar click handler. Only IPC, persistence and UI
// widget boundaries are replaced; each request settles in an explicit order.
async function fixture({ initialize = true, saved = {} } = {}) {
  const requests = [], writes = [], notifications = [], events = new Map()
  const main = {
    getDevices: () => new Promise((resolve, reject) => requests.push({ resolve: targets => resolve({ targets, errors: [] }), reject })),
    getMainStore: async key => saved[key] || null,
    on: (name, handler) => events.set(name, handler),
  }
  const store = load('src/renderer/main/store/index.ts', {
    '../../lib/util': { setMainStore: (name, value) => writes.push(['main', name, copy(value)]) },
    'share/renderer/store/BaseStore': class {},
    'share/renderer/lib/util': { setMemStore: (name, value) => writes.push(['mem', name, copy(value)]) },
    './settings': { Settings: class {} },
    './application': { Application: class {} },
    './process': { Process: class {} },
    './layout': { Layout: class {} },
  }, main).default
  await tick()
  assert.equal(requests.length, 1)
  if (initialize) {
    requests[0].resolve([target('initial')])
    await tick()
    assert.equal(store.ready, true)
    writes.length = 0
  }
  const manual = () => require('./helpers/target-picker.cjs')((file, imports) => load(file, imports, main), store, notifications).refresh()
  const event = () => events.get('changeTarget')()
  return { store, requests, writes, notifications, manual, event }
}

for (const staleFails of [false, true]) {
  for (const latestFails of [false, true]) {
    test(`late ${staleFails ? 'failure' : 'success'} cannot replace latest ${latestFails ? 'failure' : 'empty list'}`, async () => {
      const f = await fixture()
      const older = f.manual()
      const newer = f.event()
      if (latestFails) f.requests[2].reject(new Error('latest failed'))
      else f.requests[2].resolve([])
      await newer
      assert.equal(f.store.target, null)
      assert.equal(f.store.targetsError, latestFails)
      const writes = copy(f.writes)
      if (staleFails) f.requests[1].reject(new Error('obsolete failed'))
      else f.requests[1].resolve([target('obsolete')])
      await older
      assert.deepEqual(copy(f.store.targets), [])
      assert.equal(f.store.target, null)
      assert.equal(f.store.targetsError, latestFails)
      assert.deepEqual(f.writes, writes, 'obsolete results must not persist any state')
      assert.equal(f.notifications.length, 0, 'obsolete manual refresh must not notify')
    })
  }
}

test('older tracker failure cannot erase a newer successful manual refresh', async () => {
  const f = await fixture()
  const older = f.event()
  const newer = f.manual()
  f.requests[2].resolve([target('current')])
  await newer
  const writes = copy(f.writes)
  f.requests[1].reject(new Error('obsolete failed'))
  await older
  assert.deepEqual(copy(f.store.targets), [target('current')])
  assert.equal(f.store.target.key, 'current')
  assert.equal(f.store.targetsError, false)
  assert.deepEqual(f.writes, writes)
  assert.deepEqual(f.notifications.map(([, options]) => options.icon), ['success'])
})

test('superseded result is ignored even while the latest request is pending', async () => {
  const f = await fixture()
  const older = f.manual()
  const newer = f.manual()
  f.requests[1].resolve([target('obsolete')])
  await older
  assert.equal(f.store.target.key, 'initial')
  assert.equal(f.writes.length, 0)
  assert.equal(f.notifications.length, 0)
  f.requests[2].reject(new Error('latest failed'))
  await newer
  assert.equal(f.store.target, null)
  assert.equal(f.store.targetsError, true)
  assert.deepEqual(f.notifications.map(([, options]) => options.icon), ['error'])
  const retry = f.manual()
  f.requests[3].resolve([target('recovered')])
  await retry
  assert.equal(f.store.target.key, 'recovered')
  assert.equal(f.store.targetsError, false)
  assert.deepEqual(f.notifications.map(([, options]) => options.icon), ['error', 'success'])
})

test('late initialization result cannot replace a completed tracker refresh', async () => {
  const f = await fixture({ initialize: false })
  const newer = f.event()
  f.requests[1].resolve([target('current')])
  await newer
  f.requests[0].resolve([target('obsolete')])
  await tick()
  assert.equal(f.store.ready, true)
  assert.deepEqual(copy(f.store.targets), [target('current')])
  assert.equal(f.store.target.key, 'current')
})


test('Harmony tools and mirroring keep independent selections and persist to separate keys', async () => {
  const f = await fixture({initialize:false})
  const devices=[{key:'a',platform:'android'}, {key:'h',platform:'harmony'}, {key:'h2',platform:'harmony'}, {key:'i',platform:'ios'}]
  f.requests[0].resolve(devices); await tick()
  assert.equal(f.store.target.key,'h'); assert.equal(f.store.mirrorTarget.key,'a')
  f.store.selectPanel('shell'); f.store.selectMirrorTarget('i')
  assert.equal(f.store.target.key,'h'); assert.equal(f.store.panel,'shell')
  f.store.selectTarget('h2'); assert.equal(f.store.mirrorTarget.key,'i')
  assert.ok(f.writes.some(([scope,key,value])=>scope==='main'&&key==='mirrorTarget'&&value?.key==='i'))
  assert.ok(f.writes.some(([scope,key,value])=>scope==='main'&&key==='target'&&value?.key==='h2'))
  const refresh=f.event(); f.requests[1].resolve(devices.map(d=>({...d,name:'updated'}))); await refresh
  assert.equal(f.store.target.key,'h2'); assert.equal(f.store.mirrorTarget.key,'i')
  const before=copy(f.writes); f.store.selectTarget('a'); assert.equal(f.store.target.key,'h2'); assert.deepEqual(f.writes,before)
})
test('disconnecting the Harmony device never assigns an Android device to its tools', async () => {
  const f = await fixture({initialize:false})
  f.requests[0].resolve([{key:'a',platform:'android'},{key:'h',platform:'harmony'}]); await tick()
  const refresh=f.event();f.requests[1].resolve([{key:'a',platform:'android'}]);await refresh
  assert.equal(f.store.target,null);assert.equal(f.store.mirrorTarget.key,'a')
  const next=f.event();f.requests[2].resolve([{key:'h',platform:'harmony'}]);await next
  assert.equal(f.store.target.key,'h');assert.equal(f.store.mirrorTarget.key,'h')
})
test('old shared Android selection migrates to mirroring and Harmony tools select an available Harmony device', async () => {
  const f = await fixture({initialize:false,saved:{target:{key:'a',platform:'android'}}})
  f.requests[0].resolve([{key:'h',platform:'harmony'},{key:'a',platform:'android'}]);await tick()
  assert.equal(f.store.target.key,'h');assert.equal(f.store.mirrorTarget.key,'a')
  assert.ok(f.writes.some(([scope,key,value])=>scope==='main'&&key==='mirrorTarget'&&value?.key==='a'))
  assert.ok(f.writes.some(([scope,key,value])=>scope==='main'&&key==='target'&&value===null))
})
test('saved independent choices are restored even when device discovery order changes', async () => {
  const f = await fixture({initialize:false,saved:{target:{key:'h2',platform:'harmony'},mirrorTarget:{key:'i',platform:'ios'}}})
  f.requests[0].resolve([{key:'h',platform:'harmony'},{key:'i',platform:'ios'},{key:'h2',platform:'harmony'}]);await tick()
  assert.equal(f.store.target.key,'h2');assert.equal(f.store.mirrorTarget.key,'i')
})
