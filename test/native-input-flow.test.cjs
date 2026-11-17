const {test}=require('node:test')
const assert=require('node:assert/strict')
const load=require('./helpers/load-ios.cjs')
const tick=()=>new Promise(setImmediate)
function fixture(){
  const {NativeInputFlow}=load('src/renderer/native-mirror/NativeInputFlow.ts')
  const calls=[],errors=[];let finish
  const flow=new NativeInputFlow(input=>{calls.push(input);return new Promise((resolve,reject)=>{finish={resolve,reject}})},e=>errors.push(e))
  return {flow,calls,errors,get finish(){return finish}}
}
test('a wheel burst keeps one in-flight action and one combined pending action',async()=>{
  const f=fixture();for(let i=0;i<200;i++)f.flow.send({type:'scroll',x:.5,y:.5,dx:0,dy:.05})
  assert.equal(f.calls.length,1);f.finish.resolve();await tick()
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].dy,1)
  f.finish.resolve();await tick();assert.equal(f.calls.length,2);assert.equal(f.errors.length,0)
})
test('moves coalesce but release is retained and a new gesture waits for the preceding release',async()=>{
  const f=fixture();assert.equal(f.flow.send({type:'touch',action:'down',x:0,y:0}),true)
  for(let i=1;i<=200;i++)f.flow.send({type:'touch',action:'move',x:i/200,y:.5})
  f.flow.send({type:'touch',action:'up',x:1,y:.5})
  assert.equal(f.flow.send({type:'touch',action:'down',x:0,y:0}),false)
  f.finish.resolve();await tick();assert.equal(f.calls[1].action,'move');assert.equal(f.calls[1].x,1)
  f.finish.resolve();await tick();assert.equal(f.calls[2].action,'up')
  f.finish.resolve();await tick();assert.equal(f.flow.send({type:'touch',action:'down',x:0,y:0}),true)
  f.finish.resolve();await tick();f.flow.dispose();f.finish.resolve();await tick()
})
test('failed input drops queued writes and does not replay them after reset',async()=>{
  const f=fixture();f.flow.send({type:'scroll',x:.5,y:.5,dx:0,dy:.5});f.flow.send({type:'scroll',x:.5,y:.5,dx:0,dy:.5})
  f.finish.reject(Error('unknown outcome'));await tick()
  assert.equal(f.calls.length,1);assert.equal(f.errors.length,1)
  assert.equal(f.flow.send({type:'key',keyCode:3}),false)
  f.flow.reset();assert.equal(f.flow.send({type:'key',keyCode:3}),true)
  f.finish.resolve();await tick();assert.equal(f.calls.length,2)
})

test('failed gesture cancels its reservation without resending the action',async()=>{
  const f=fixture();f.flow.send({type:'touch',action:'down',x:.2,y:.3});f.finish.resolve();await tick()
  f.flow.send({type:'touch',action:'up',x:.2,y:.3});f.finish.reject(Error('unknown outcome'));await tick()
  assert.deepEqual(f.calls.map(i=>i.action),['down','up','cancel'])
  f.finish.resolve();await tick();assert.equal(f.errors.length,1)
  assert.equal(f.flow.send({type:'touch',action:'down',x:.2,y:.3}),false)
})
test('disposing during a gesture discards moves and releases it after the pending IPC',async()=>{
  const f=fixture();f.flow.send({type:'touch',action:'down',x:.2,y:.3})
  f.flow.send({type:'touch',action:'move',x:.4,y:.5});f.flow.dispose()
  f.finish.resolve();await tick();assert.deepEqual(f.calls.map(i=>i.action),['down','cancel'])
  f.finish.resolve();await tick();assert.equal(f.flow.send({type:'key',keyCode:3}),false)
})
