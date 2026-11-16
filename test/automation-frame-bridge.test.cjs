const {test}=require('node:test')
const assert=require('node:assert/strict')
const load=require('./helpers/load-automation.cjs')
const meta={sequence:1,capturedAt:1000,width:2,height:3,rotation:0,generation:1}
function fixture(){const {AutomationFrameBridge}=load('src/main/automation/frameBridge.ts');const handlers=new Map();const bridge=new AutomationFrameBridge({handle:(key,fn)=>handlers.set(key,fn)});return {bridge,handlers}}
function contents(id){const c={id,mainFrame:{id},send(){},isDestroyed:()=>false};return c}
const context=()=>({clientId:'test',deadline:Date.now()+1000,signal:new AbortController().signal})
test('frame responses require registered owner, request id and main frame',async()=>{
 const {bridge,handlers}=fixture(),a=contents(1),b=contents(2)
 bridge.register(a,()=>{});bridge.register(b,()=>{})
 let request;a.send=(_event,value)=>{request=value}
 const pending=bridge.request(a,'metadata',context());await Promise.resolve();await Promise.resolve()
 const reply=handlers.get('automationFrameResult')
 assert.throws(()=>reply({sender:b,senderFrame:b.mainFrame},request.requestId,{ok:true,metadata:meta}),{code:'UNAUTHORIZED'})
 assert.throws(()=>reply({sender:a,senderFrame:{}},request.requestId,{ok:true,metadata:meta}),{code:'UNAUTHORIZED'})
 reply({sender:a,senderFrame:a.mainFrame},request.requestId,{ok:true,metadata:meta})
 assert.deepEqual((await pending).metadata,meta)
 assert.throws(()=>reply({sender:a,senderFrame:a.mainFrame},request.requestId,{ok:true,metadata:meta}),{code:'NOT_FOUND'})
})
test('cancel and owner teardown reject pending frame requests and discard late responses',async()=>{
 const {bridge}=fixture(),a=contents(1);const dispose=bridge.register(a,()=>{})
 const abort=new AbortController();const pending=bridge.request(a,'capture',{...context(),signal:abort.signal})
 abort.abort();await assert.rejects(pending,{code:'CANCELLED'})
 const second=bridge.request(a,'capture',context());dispose();await assert.rejects(second,{code:'UNAVAILABLE'})
})
test('capture rejects oversized bytes and dimensions inconsistent with PNG data',async()=>{
 const {bridge,handlers}=fixture(),a=contents(1);bridge.register(a,()=>{})
 let request;a.send=(_event,value)=>{request=value}
 const pending=bridge.request(a,'capture',context());await Promise.resolve();await Promise.resolve()
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(9,16);png.writeUInt32BE(3,20)
 handlers.get('automationFrameResult')({sender:a,senderFrame:a.mainFrame},request.requestId,{ok:true,metadata:meta,png})
 await assert.rejects(pending,{code:'INTERNAL'})
})
test('registered state notifications are bounded and never accepted from another document',()=>{
 const {bridge,handlers}=fixture(),a=contents(1);const events=[];bridge.register(a,value=>events.push(value))
 const report=handlers.get('automationFrameState')
 report({sender:a,senderFrame:a.mainFrame},{state:'presented',metadata:meta})
 assert.equal(events.length,1)
 assert.throws(()=>report({sender:a,senderFrame:{}},{state:'presented',metadata:meta}),{code:'UNAUTHORIZED'})
 assert.throws(()=>report({sender:a,senderFrame:a.mainFrame},{state:'arbitrary'}),{code:'INVALID_ARGUMENT'})
})
test('capture rejects data beyond 32 MiB before resolving the consumer',async()=>{
 const {bridge,handlers}=fixture(),a=contents(1);bridge.register(a,()=>{});let request;a.send=(_name,value)=>{request=value}
 const pending=bridge.request(a,'capture',context())
 handlers.get('automationFrameResult')({sender:a,senderFrame:a.mainFrame},request.requestId,{ok:true,metadata:meta,png:new Uint8Array(32*1024*1024+1)})
 await assert.rejects(pending,{code:'INTERNAL'})
})
