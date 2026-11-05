const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')

test('source-built AirPlay addon serves real RTSP info, rejects a second receiver and restarts cleanly',
  { skip: process.env.SCRCPY_PLUS_NATIVE_TEST !== '1', timeout: 15000 }, async t => {
    const { Receiver } = require('../resources/airplay/plus_airplay.node')
    const bplist = await import('bplist-parser')
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plus-airplay-native-'))
    const receiver = new Receiver(), other = new Receiver()
    t.after(() => { receiver.stop(); other.stop(); fs.rmSync(directory, { recursive: true, force: true }) })
    const start = () => receiver.start('Scrcpy Plus Source Test', '02:11:22:33:44:55', path.join(directory, 'key'), () => {})
    const port = start()
    assert.ok(port > 0)
    assert.throws(() => other.start('Other', '02:11:22:33:44:56', path.join(directory, 'other'), () => {}), /already active/)
    const info = await new Promise((resolve, reject) => {
      let data = Buffer.alloc(0)
      const socket = net.connect(port, '127.0.0.1', () => socket.write('GET /info RTSP/1.0\r\nCSeq: 1\r\n\r\n'))
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('RTSP timeout')) }, 2500)
      socket.on('error', error => { clearTimeout(timer); reject(error) })
      socket.on('data', chunk => {
        data = Buffer.concat([data, chunk]); const end = data.indexOf('\r\n\r\n')
        if (end < 0) return
        const headers = data.subarray(0, end).toString()
        const length = Number(headers.match(/Content-Length: (\d+)/i)?.[1] || 0)
        if (data.length < end + 4 + length) return
        clearTimeout(timer); socket.destroy()
        try { assert.match(headers, /^RTSP\/1.0 200/); resolve(bplist.parseBuffer(data.subarray(end + 4, end + 4 + length))[0]) }
        catch (error) { reject(error) }
      })
    })
    assert.equal(info.name, 'Scrcpy Plus Source Test')
    assert.equal(info.model, 'AppleTV3,2')
    receiver.stop(); receiver.stop()
    assert.ok(start() > 0)
    receiver.stop()
  })

test('AirPlay source wrapper runs native joins on a worker and shuts down without blocking the main loop',
  { skip: process.env.SCRCPY_PLUS_NATIVE_TEST !== '1', timeout: 20000 }, async t => {
    const vm = require('node:vm'), { transformSync } = require('esbuild')
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plus-airplay-worker-'))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    function load(file) {
      const module = { exports: {} }
      vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, Buffer, Uint8Array, setTimeout, clearTimeout,
          require(id) {
            if (id === 'share/main/lib/util') return { getUserDataPath: name => path.join(directory, name), resolveResources: name => path.resolve('resources', name) }
            if (id === './airplay-worker') return load('src/main/lib/devices/airplay-worker.ts')
            return require(id)
          },
        })
      return module.exports
    }
    const { AirplayMirror } = load('src/main/lib/devices/airplay.ts')
    const mirror = new AirplayMirror(), states = []
    t.after(() => mirror.close())
    await mirror.start(() => {}, state => states.push(state))
    assert.deepEqual(states, ['waiting'])
    const before = performance.now(), stopping = mirror.close()
    assert.ok(performance.now() - before < 100, 'stop schedules work instead of blocking on native thread joins')
    await stopping
  })
