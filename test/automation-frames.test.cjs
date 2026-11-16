const {test}=require('node:test')
const assert=require('node:assert/strict')
const load=require('./helpers/load-automation.cjs')
function fixture(){const {FrameLedger}=load('src/main/automation/frames.ts');let now=10000;const ledger=new FrameLedger(()=>now);return {ledger,advance(ms){now+=ms},meta:(sequence=1,patch={})=>({sequence,capturedAt:now,width:100,height:200,rotation:0,generation:1,...patch})}}
test('placeholder, invalid metadata and stale images are never issued as fresh screenshots',()=>{
 const f=fixture();assert.throws(()=>f.ledger.issue('s',f.meta(0)),{code:'UNAVAILABLE'})
 assert.throws(()=>f.ledger.issue('s',f.meta(1,{width:NaN})),{code:'INVALID_ARGUMENT'})
 f.advance(3000);assert.throws(()=>f.ledger.issue('s',f.meta(1,{capturedAt:10000})),{code:'UNAVAILABLE'})
 const old=f.ledger.issue('s',f.meta(1,{capturedAt:10000}),{allowStale:true});assert.equal(old.stale,true);assert.equal(old.capturedAt,10000)
})
test('exported screenshot geometry survives high video frame rate and expires after sixty seconds',()=>{
 const f=fixture();const image=f.ledger.issue('s',f.meta())
 for(let i=2;i<240;i++) f.ledger.observe('s',f.meta(i))
 assert.equal(f.ledger.geometry('s',image.frameId).width,100)
 f.advance(60001);assert.throws(()=>f.ledger.geometry('s',image.frameId),{code:'INVALID_ARGUMENT'})
})
test('sixteen exported screenshots are retained and other sessions cannot reuse a frame reference',()=>{
 const f=fixture();const first=f.ledger.issue('s',f.meta());let recent
 for(let i=2;i<=17;i++) recent=f.ledger.issue('s',f.meta(i))
 assert.throws(()=>f.ledger.geometry('s',first.frameId),{code:'INVALID_ARGUMENT'})
 assert.equal(f.ledger.geometry('s',recent.frameId).height,200)
 assert.throws(()=>f.ledger.geometry('other',recent.frameId),{code:'INVALID_ARGUMENT'})
})
test('dimension, rotation and generation changes invalidate prior coordinate references',()=>{
 for(const patch of [{width:200,height:100},{rotation:180},{generation:2}]) {
  const f=fixture();const image=f.ledger.issue('s',f.meta());f.ledger.observe('s',f.meta(2,patch))
  assert.throws(()=>f.ledger.geometry('s',image.frameId),{code:'INVALID_ARGUMENT'})
 }
})
test('after-action requires a later presentation and cannot be bypassed by allow-stale',()=>{
 const f=fixture();const token=f.ledger.barrier('s',f.meta(10))
 assert.throws(()=>f.ledger.issue('s',f.meta(10),{afterAction:token,allowStale:true}),{code:'UNAVAILABLE'})
 const next=f.ledger.issue('s',f.meta(11),{afterAction:token});assert.equal(next.sequence,11)
 assert.throws(()=>f.ledger.issue('other',f.meta(11),{afterAction:token}),{code:'INVALID_ARGUMENT'})
 f.advance(60001);assert.throws(()=>f.ledger.issue('s',f.meta(12),{afterAction:token}),{code:'INVALID_ARGUMENT'})
})
test('renderer disconnect invalidates all snapshots and observation tokens',()=>{
 const f=fixture();const image=f.ledger.issue('s',f.meta());const token=f.ledger.barrier('s',f.meta())
 f.ledger.invalidate('s')
 assert.throws(()=>f.ledger.geometry('s',image.frameId),{code:'INVALID_ARGUMENT'})
 assert.throws(()=>f.ledger.issue('s',f.meta(2),{afterAction:token}),{code:'INVALID_ARGUMENT'})
})
