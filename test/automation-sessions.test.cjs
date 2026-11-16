const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/load-automation.cjs')
const target = { key:'android:a', name:'A', platform:'android', state:'ready' }
const context = clientId => ({clientId,deadline:Date.now()+1000,signal:new AbortController().signal})
function fixture() {
 const { AutomationSessions }=load('src/main/automation/sessions.ts')
 const registry=new AutomationSessions('instance-test'); let closed=0,hidden=0,shown=0
 const controls={close:async()=>{closed++},hide:()=>{hidden++},show:()=>{shown++}}
 const open=async()=>{registry.register(target,controls,false)}
 return { registry,controls,open,counts:()=>({closed,hidden,shown}) }
}
test('window existence does not imply a running session; frames advance state and revision',async()=>{
 const f=fixture(); const started=await f.registry.start(target,context('a'),f.open)
 assert.equal(started.state,'starting')
 f.registry.setState(started.sessionId,'running')
 assert.equal(f.registry.get(started.sessionId).state,'running')
 assert.ok(f.registry.get(started.sessionId).revision>started.revision)
})
test('same-client concurrent starts share one lease and different clients share one backend',async()=>{
 const f=fixture();let opens=0
 const open=async()=>{opens++;await Promise.resolve();await f.open()}
 const [a,a2,b]=await Promise.all([f.registry.start(target,context('a'),open),f.registry.start(target,context('a'),open),f.registry.start(target,context('b'),open)])
 assert.equal(opens,1);assert.equal(a.leaseId,a2.leaseId);assert.notEqual(a.leaseId,b.leaseId);assert.equal(a.sessionId,b.sessionId)
 assert.deepEqual(f.registry.leases('a').map(x=>x.leaseId),[a.leaseId])
 await assert.rejects(f.registry.release(a.sessionId,a.leaseId,context('b')),{code:'UNAUTHORIZED'})
})
test('releasing one owner keeps the backend and releasing the last owner closes exactly once',async()=>{
 const f=fixture(); const a=await f.registry.start(target,context('a'),f.open);const b=await f.registry.start(target,context('b'),f.open)
 await f.registry.release(a.sessionId,a.leaseId,context('a'));assert.equal(f.counts().closed,0)
 await f.registry.release(b.sessionId,b.leaseId,context('b'));assert.equal(f.counts().closed,1)
 await f.registry.release(b.sessionId,b.leaseId,context('b'));assert.equal(f.counts().closed,1)
 assert.equal(f.registry.get(a.sessionId).state,'stopped')
 assert.equal(f.registry.leases('a').length,0)
})
test('GUI close hides a leased window and re-opening reclaims its GUI owner',async()=>{
 const f=fixture();const id=f.registry.register(target,f.controls,true)
 const a=await f.registry.start(target,context('a'),f.open)
 assert.equal(a.sessionId,id)
 assert.equal(f.registry.releaseGui(id),true);assert.equal(f.counts().hidden,1)
 f.registry.claimGui(id);assert.equal(f.counts().shown,1)
 await f.registry.release(id,a.leaseId,context('a'));assert.equal(f.counts().closed,0)
 assert.equal(f.registry.releaseGui(id),false)
 f.registry.closed(id);assert.equal(f.registry.get(id).state,'stopped')
})
test('failed backend cleanup retains lease for explicit retry instead of reporting stopped',async()=>{
 const f=fixture();let fail=true
 const open=async()=>f.registry.register(target,{...f.controls,close:async()=>{if(fail)throw Error('transport failure')}},false)
 const a=await f.registry.start(target,context('a'),open)
 await assert.rejects(f.registry.release(a.sessionId,a.leaseId,context('a')),{code:'OUTCOME_UNKNOWN'})
 assert.equal(f.registry.get(a.sessionId).state,'error');assert.equal(f.registry.leases('a').length,1)
 fail=false;await f.registry.release(a.sessionId,a.leaseId,context('a'));assert.equal(f.registry.get(a.sessionId).state,'stopped')
})
test('old-instance sessions and unowned actions fail; cancelled start cleans an unclaimed window',async()=>{
 const f=fixture();assert.throws(()=>f.registry.get('old-instance:session'),{code:'NOT_FOUND'})
 const abort=new AbortController();const ctx={...context('a'),signal:abort.signal}
 await assert.rejects(f.registry.start(target,ctx,async()=>{await f.open();abort.abort()}),{code:'CANCELLED'})
 assert.equal(f.counts().closed,1)
 const a=await f.registry.start(target,context('a'),f.open)
 assert.throws(()=>f.registry.requireLease(a.sessionId,'b'),{code:'UNAUTHORIZED'})
})
test('waiting observes real transitions and respects cancellation',async()=>{
 const f=fixture();const a=await f.registry.start(target,context('a'),f.open)
 const waiting=f.registry.wait(a.sessionId,'running',context('a'))
 f.registry.setState(a.sessionId,'running');assert.equal((await waiting).state,'running')
 const abort=new AbortController();const pending=f.registry.wait(a.sessionId,'stopped',{...context('a'),signal:abort.signal});abort.abort()
 await assert.rejects(pending,{code:'CANCELLED'})
})
test('cancelling the first opener does not close a concurrent successful claimant',async()=>{
 const f=fixture();const abort=new AbortController();let proceed
 const gate=new Promise(resolve=>{proceed=resolve})
 const open=async()=>{await gate;await f.open();abort.abort()}
 const first=f.registry.start(target,{...context('first'),signal:abort.signal},open)
 const second=f.registry.start(target,context('second'),open)
 proceed()
 await assert.rejects(first,{code:'CANCELLED'})
 const acquired=await second
 assert.equal(f.registry.get(acquired.sessionId).state,'starting')
 assert.equal(f.counts().closed,0)
})
test('stopped sessions remain queryable for five minutes then expire',async()=>{
 const {AutomationSessions}=load('src/main/automation/sessions.ts');let now=1000
 const registry=new AutomationSessions('test',()=>now)
 const id=registry.register(target,{close:async()=>{},hide(){},show(){}},true)
 registry.closed(id);now+=299999;assert.equal(registry.get(id).state,'stopped')
 now++;assert.throws(()=>registry.get(id),{code:'NOT_FOUND'})
})
test('unconfirmed cleanup returns within its budget, retains lease and closes on late confirmation',async()=>{
 const {AutomationSessions}=load('src/main/automation/sessions.ts');const sessions=new AutomationSessions('i',Date.now,20);let finish,id
 const result=await sessions.start(target,context('a'),async()=>{id=sessions.register(target,{hide(){},show(){},close:()=>new Promise(r=>{finish=r})},false)})
 await assert.rejects(sessions.release(id,result.leaseId,context('a')),{code:'OUTCOME_UNKNOWN'})
 assert.equal(sessions.get(id).state,'error');assert.equal(sessions.leases('a').length,1)
 finish();await new Promise(setImmediate);assert.equal(sessions.get(id).state,'stopped')
})
