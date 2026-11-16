const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-automation.cjs')
test('Android adapter retains the selected backend and translates named keys',async()=>{
 const {androidInput}=load('src/main/automation/adapters/android.ts');const sent=[];const b=androidInput(async value=>sent.push(value));const signal=new AbortController().signal
 await b.touch('down',0.25,0.5,signal);await b.key('home',signal)
 assert.deepEqual(sent,[{type:'touch',action:'down',x:0.25,y:0.5},{type:'key',keyCode:3}])
})
test('Harmony adapter maps normalized canvas coordinates to queried display pixels and retains release obligations',async()=>{
 const {harmonyInput}=load('src/main/automation/adapters/harmony.ts');const calls=[];const lease={driver:{touchDown:async(x,y)=>calls.push(['down',x,y]),touchMove:async()=>{},touchUp:async(x,y)=>calls.push(['up',x,y])}}
 const b=harmonyInput(lease,{width:1000,height:2000},{text:async()=>{},key:async()=>{}});const signal=new AbortController().signal
 await b.touch('down',.25,.5,signal);assert.deepEqual(lease.touch,{x:250,y:1000})
 await b.touch('up',.25,.5,signal);assert.equal(lease.touch,undefined);assert.deepEqual(calls,[['down',250,1000],['up',250,1000]])
 lease.driver.touchUp=async()=>{throw Error('unknown')};await b.touch('down',.25,.5,signal);await assert.rejects(b.touch('up',.25,.5,signal));assert.ok(lease.touch)
})
