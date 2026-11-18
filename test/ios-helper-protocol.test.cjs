const {test}=require('node:test'),assert=require('node:assert/strict')
const load=require('./helpers/load-ios.cjs')
const {HelperProtocol}=load('src/main/lib/ios-provisioning/protocol.ts')
test('fragmented output resolves only bounded result and sanitizes errors',()=>{
 const messages=[],p=new HelperProtocol(x=>messages.push(x))
 p.push('{"res');p.push('ult":{"ready":true}}\n');assert.equal(messages[0].result.ready,true)
 assert.throws(()=>p.push('{"error":"password: secret"}\n'),/protocol/)
})
test('oversized or duplicate terminal messages rejected',()=>{
 assert.throws(()=>new HelperProtocol(()=>{}).push('a'.repeat(65537)),/protocol/)
 const p=new HelperProtocol(()=>{});p.push('{"result":{}}\n');assert.throws(()=>p.push('{"result":{}}\n'),/protocol/)
})
