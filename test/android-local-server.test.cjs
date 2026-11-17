const { test } = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'plus-local-adb-test-'))
buildSync({entryPoints:['src/main/lib/devices/androidServer.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'server.cjs')})
const {connectLocalAdb,LocalAdbConnector}=require(path.join(temp,'server.cjs'))
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}))
async function server(t,devices='phone device model:Phone transport_id:7\nother device transport_id:9\n') {
 const calls=[], sockets=new Set()
 const string=s=>s.length.toString(16).padStart(4,'0')+s
 const listener=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{})
  let buffered=Buffer.alloc(0)
  socket.on('data',chunk=>{
   buffered=Buffer.concat([buffered,chunk])
   while(buffered.length>=4){const size=parseInt(buffered.subarray(0,4).toString(),16);if(buffered.length<size+4)return
    const command=buffered.subarray(4,size+4).toString();buffered=buffered.subarray(size+4);calls.push(command)
    if(command==='host:devices-l')socket.write('OKAY'+string(devices))
    else if(command==='host:transport-id:7')socket.write('OKAY')
    else if(command==='host:features')socket.write('OKAY'+string(''))
    else if(command==='host:version')socket.write('OKAY'+string('0029'))
    else if(command==='host-transport-id:7:wait-for-any-disconnect')socket.write('OKAY')
    else if(command==='shell:echo test'){socket.write('OKAYtest');socket.end()}
    else socket.end('FAIL'+string('unexpected request'))
   }
  })
 })
 await new Promise(r=>listener.listen(0,'127.0.0.1',r))
 t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>listener.close(r))})
 return {calls,sockets,connector:new LocalAdbConnector(listener.address().port)}
}
test('local ADB binds the exact transport and closes only its own sockets',async t=>{
 const f=await server(t), adb=await connectLocalAdb('phone',f.connector)
 assert.equal(adb.serial,'phone')
 const socket=await adb.createSocket('shell:echo test'),reader=socket.readable.getReader();let output=''
 for(;;){const chunk=await reader.read();if(chunk.done)break;output+=Buffer.from(chunk.value).toString()}
 assert.equal(output,'test');reader.releaseLock();await adb.close()
 await new Promise(setImmediate)
 assert.ok(f.calls.includes('host:transport-id:7'))
 assert.ok(f.calls.every(c=>!c.includes('kill')&&!c.includes('reconnect')&&!c.includes('transport-id:9')))
 await assert.rejects(f.connector.connect(),/closed/)
})
for(const devices of ['other device transport_id:9\n','phone unauthorized transport_id:7\n','phone device transport_id:7\nphone device transport_id:9\n'])test('local ADB rejects absent, unauthorized or ambiguous serial: '+devices.trim().replaceAll('\n',';'),async t=>{
 const f=await server(t,devices);await assert.rejects(connectLocalAdb('phone',f.connector),/unavailable/)
 assert.deepEqual(f.calls,['host:devices-l']);await assert.rejects(f.connector.connect(),/closed/)
})
test('local ADB rejects serial command injection before connecting',async t=>{
 const f=await server(t);await assert.rejects(connectLocalAdb('phone:kill',f.connector),/Invalid/);assert.deepEqual(f.calls,[])
})
