const {test}=require('node:test')
const assert=require('node:assert/strict')
const load=require('./helpers/load-automation.cjs')
const context=()=>({clientId:'test',deadline:Date.now()+1000,signal:new AbortController().signal})
const geometry={width:100,height:200,displayRevision:1}
function backend(calls){return {touch:async(action,x,y)=>calls.push([action,x,y]),scroll:async(x,y,dx,dy)=>calls.push(['scroll',x,y,dx,dy]),text:async text=>calls.push(['text',text]),key:async key=>calls.push(['key',key])}}
test('tap maps screenshot coordinates to normalized device space and always releases',async()=>{
 const {executeInput}=load('src/main/automation/input.ts');const calls=[]
 await executeInput({type:'tap',x:25,y:100},geometry,backend(calls),context())
 assert.deepEqual(calls,[['down',0.25,0.5],['up',0.25,0.5]])
})
test('invalid coordinates and text fail before touching the backend',async()=>{
 const {executeInput}=load('src/main/automation/input.ts');const calls=[]
 for(const action of [{type:'tap',x:100,y:1},{type:'tap',x:NaN,y:1},{type:'text',text:'x'.repeat(16385)},{type:'swipe',x:0,y:0,toX:20,toY:20,durationMs:0}])await assert.rejects(executeInput(action,geometry,backend(calls),context()),{code:'INVALID_ARGUMENT'})
 assert.deepEqual(calls,[])
})
test('cancelled gesture sends a release using a fresh cleanup signal',async()=>{
 const {executeInput}=load('src/main/automation/input.ts');const calls=[],abort=new AbortController()
 const b=backend(calls);b.touch=async(action,x,y,signal)=>{calls.push([action,signal.aborted]);if(action==='down')abort.abort()}
 await assert.rejects(executeInput({type:'swipe',x:0,y:0,toX:20,toY:20,durationMs:100},geometry,b,{...context(),signal:abort.signal}),{code:'CANCELLED'})
 assert.deepEqual(calls,[['down',false],['up',false]])
})
test('unconfirmed release reports unsafe input state instead of successful cancellation',async()=>{
 const {executeInput}=load('src/main/automation/input.ts');const b=backend([])
 b.touch=async action=>{if(action==='up')throw Error('no reply')}
 await assert.rejects(executeInput({type:'tap',x:0,y:0},geometry,b,context()),{code:'OUTCOME_UNKNOWN',unsafeInput:true})
})
test('same-device automatic actions serialize and other devices remain independent',async()=>{
 const {DeviceInputQueue}=load('src/main/automation/input.ts');const queue=new DeviceInputQueue();const order=[];let release
 const first=queue.automatic('a',context(),async()=>{order.push('a1');await new Promise(r=>{release=r});order.push('a1done')})
 const second=queue.automatic('a',context(),async()=>{order.push('a2')})
 await queue.automatic('b',context(),async()=>{order.push('b')})
 assert.deepEqual(order,['a1','b']);release();await Promise.all([first,second]);assert.deepEqual(order,['a1','b','a1done','a2'])
})
test('active GUI touches reject automation; pending automation rejects interleaved GUI input',async()=>{
 const {DeviceInputQueue}=load('src/main/automation/input.ts');const queue=new DeviceInputQueue()
 await queue.gui('a','down',async()=>{})
 await assert.rejects(queue.automatic('a',context(),async()=>{}),{code:'BUSY'})
 await queue.gui('a','up',async()=>{})
 let release;const automatic=queue.automatic('a',context(),async()=>new Promise(r=>{release=r}))
 await assert.rejects(queue.gui('a','down',async()=>{}),{code:'BUSY'})
 await Promise.resolve();release();await automatic
})
test('unsafe cleanup blocks subsequent input until the old session is discarded',async()=>{
 const {DeviceInputQueue,UnsafeInputFault}=load('src/main/automation/input.ts');const queue=new DeviceInputQueue()
 await assert.rejects(queue.automatic('a',context(),async()=>{throw new UnsafeInputFault()}),{code:'OUTCOME_UNKNOWN'})
 await assert.rejects(queue.automatic('a',context(),async()=>{}),{code:'UNAVAILABLE'})
 await assert.rejects(queue.gui('a','down',async()=>{}),{code:'UNAVAILABLE'})
 queue.discard('a');await queue.automatic('a',context(),async()=>{})
})
test('a hung press is bounded by the deadline and still attempts release',async()=>{
 const {executeInput}=load('src/main/automation/input.ts');const calls=[];const b=backend(calls)
 b.touch=async action=>{calls.push(action);if(action==='down')await new Promise(()=>{})}
 await assert.rejects(executeInput({type:'tap',x:0,y:0},geometry,b,{...context(),deadline:Date.now()+20}),{code:'OUTCOME_UNKNOWN'})
 assert.deepEqual(calls,['down','up'])
})
test('failed GUI press permits cleanup but keeps subsequent input quarantined',async()=>{
 const {DeviceInputQueue}=load('src/main/automation/input.ts');const queue=new DeviceInputQueue();let released=false
 await assert.rejects(queue.gui('a','down',async()=>{throw Error('lost response')}),{code:'OUTCOME_UNKNOWN'})
 await queue.gui('a','up',async()=>{released=true})
 assert.equal(released,true)
 await assert.rejects(queue.automatic('a',context(),async()=>{}),{code:'UNAVAILABLE'})
})
test('rejected GUI press on a full queue does not retain a touch reservation',async()=>{
 const {DeviceInputQueue}=load('src/main/automation/input.ts');const queue=new DeviceInputQueue();let finish
 const tasks=[queue.gui('a',undefined,async()=>new Promise(r=>{finish=r}))]
 for(let i=1;i<64;i++)tasks.push(queue.gui('a',undefined,async()=>{}))
 await assert.rejects(queue.gui('a','down',async()=>{}),{code:'BUSY'})
 finish();await Promise.all(tasks)
 await queue.automatic('a',context(),async()=>{})
})
test('replacement generation waits for the preceding gesture cleanup',async()=>{
 const {DeviceInputQueue}=load('src/main/automation/input.ts');const queue=new DeviceInputQueue();let finish;const order=[]
 const old=queue.automatic('a',context(),async()=>{order.push('old');await new Promise(r=>{finish=r});order.push('release')})
 await Promise.resolve();queue.discard('a')
 const next=queue.automatic('a',context(),async()=>{order.push('new')})
 await new Promise(setImmediate);assert.deepEqual(order,['old']);finish();await Promise.all([old,next]);assert.deepEqual(order,['old','release','new'])
})
test('dispatched text/scroll failures and cancellation never claim not-started',async()=>{
 const {executeInput}=load('src/main/automation/input.ts');const actions=[{type:'text',text:'once'},{type:'scroll',x:1,y:1,dx:0,dy:1},{type:'tap',x:1,y:1}]
 for(const action of actions){
  const b=backend([]);if(action.type!=='tap'){
   b[action.type]=async()=>{throw Error('lost acknowledgement')}
   await assert.rejects(executeInput(action,geometry,b,context()),{code:'OUTCOME_UNKNOWN',outcome:'unknown'})
  }
  const abort=new AbortController();const c=backend([])
  if(action.type==='tap')c.touch=async phase=>{if(phase==='down')abort.abort()}
  else c[action.type]=async()=>{abort.abort()}
  await assert.rejects(executeInput(action,geometry,c,{...context(),signal:abort.signal}),error=>{assert.equal(error.outcome,'unknown');assert.equal(error.retryable,false);return true})
 }
})
