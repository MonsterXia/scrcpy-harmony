const {test}=require('node:test')
const assert=require('node:assert/strict')
const load=require('./helpers/load-automation.cjs')
function fixture(){
 const {AutomationFrameSource}=load('src/renderer/lib/AutomationFrameSource.ts');let listener;const states=[],replies=[]
 const port={on:(_name,cb)=>{listener=cb;return()=>{listener=undefined}},automationFrameState:async v=>states.push(v),automationFrameResult:async(id,v)=>replies.push([id,v])}
 const canvas={width:2,height:3,toBlob:cb=>cb(new Blob(['png']))}
 let now=1000;const source=new AutomationFrameSource(port,()=>canvas,()=>now)
 return {source,canvas,states,replies,request:v=>listener(v),tick:()=>{now++}}
}
test('source never reports an unpresented canvas and records actual presentation time',async()=>{
 const f=fixture();await f.request({requestId:'a',method:'capture'})
 assert.equal(f.replies[0][1].ok,false)
 f.source.presented();f.tick();await f.request({requestId:'b',method:'metadata'})
 assert.deepEqual(f.replies[1][1].metadata,{sequence:1,capturedAt:1000,width:2,height:3,generation:1,rotation:0})
 f.source.presented();assert.equal(f.states.length,1)
 f.canvas.width=3;f.source.presented();assert.equal(f.states.length,2)
})
test('async PNG encoding retains the metadata of the bitmap at request time',async()=>{
 const f=fixture();f.source.presented();let encode
 f.canvas.toBlob=cb=>{encode=cb}
 const task=f.request({requestId:'a',method:'capture'});f.tick();f.source.presented()
 encode(new Blob(['bytes']));await task
 assert.equal(f.replies[0][1].metadata.sequence,1)
 assert.equal(Buffer.from(f.replies[0][1].png).toString(),'bytes')
})
test('reset/disconnect drops stale frames and invalidates captures still encoding',async()=>{
 const f=fixture();f.source.presented();let encode
 f.canvas.toBlob=cb=>{encode=cb};const task=f.request({requestId:'a',method:'capture'})
 f.source.reset('disconnected');encode(new Blob(['old']));await task
 assert.equal(f.replies[0][1].ok,false)
 f.source.presented();await f.request({requestId:'b',method:'metadata'})
 assert.equal(f.replies[1][1].metadata.generation,2)
 f.source.dispose();assert.equal(f.states.at(-1).state,'disconnected')
})
