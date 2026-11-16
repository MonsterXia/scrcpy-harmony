const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')
const { transformSync } = require('esbuild')
function load(extra = {}) {
 const module = { exports: {} }
 vm.runInNewContext(transformSync(fs.readFileSync('src/main/lib/devices/androidOverview.ts','utf8'),{loader:'ts',format:'cjs'}).code,
  {module,exports:module.exports,require,TextDecoder,AbortController,setTimeout,clearTimeout,...extra})
 return module.exports
}
const fixture = {'getprop':'[ro.product.model]: [Pixel 9]\n[ro.product.brand]: [Google]\n[ro.build.version.release]: [16]\n[ro.build.version.sdk]: [36]\n[ro.product.cpu.abilist]: [arm64-v8a]\n[ro.soc.model]: [Tensor]\n[ro.serialno]: [test]', 'uname -r':'6.1.0\n','wm size':'Physical size: 1080x2400\nOverride size: 720x1600','cat /proc/meminfo':'MemTotal: 8192000 kB'}
test('Android overview reads bounded fixed commands, parses metadata and closes only shell sockets', async () => {
 const { readAndroidOverview } = load(); const commands = [], killed = []
 const adb = {subprocess:{noneProtocol:{spawn:async command=>{commands.push(command);return {output: new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(fixture[command]));c.close()}}),exited:Promise.resolve(),kill:()=>killed.push(command)}}}}}
 const info = await readAndroidOverview(adb)
 assert.deepEqual(commands,Object.keys(fixture)); assert.equal(killed.length,4)
 assert.equal(info.name,'Pixel 9');assert.equal(info.osVersion,'Android 16 (API 36)');assert.equal(info.physicalResolution,'1080x2400');assert.equal(info.memTotal,8388608000)
})
test('Android overview command timeout aborts shell and preserves the shared ADB transport', async () => {
 const { readAndroidOverview } = load({setTimeout: callback=>setTimeout(callback,5)})
 let killed=0, aborted=0
 const adb={subprocess:{noneProtocol:{spawn:async(_command,signal)=>{signal.addEventListener('abort',()=>aborted++);return {output:new ReadableStream({}),exited:Promise.resolve(),kill:()=>killed++}}}}}
 await assert.rejects(readAndroidOverview(adb),/timed out/)
 assert.equal(aborted,1);assert.equal(killed,1)
})
