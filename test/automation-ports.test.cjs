const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-automation.cjs')
const ctx=output=>({clientId:'test',deviceKey:'h',deadline:Date.now()+1000,signal:new AbortController().signal,host:async()=>output,shell:async()=>''})
test('port snapshots preserve direction and filter the explicitly selected device',async()=>{
 const api=load('src/main/lib/hdc/port.ts',{'share/main/lib/util':{handleEvent(){}}})
 const context=ctx('h tcp:1000 tcp:2000 [Forward]\nh tcp:4000 tcp:3000 [Reverse]\nother tcp:5000 tcp:6000 [Forward]\n')
 assert.deepEqual(await api.listForwards('h',context),[{local:'tcp:1000',remote:'tcp:2000'}])
 assert.deepEqual(await api.listReverses('h',context),[{local:'tcp:3000',remote:'tcp:4000'}])
 await assert.rejects(api.listForwards('other',context),/context/)
})
test('port mutation sends only one exact mapping and checks its acknowledgement',async()=>{
 const api=load('src/main/lib/hdc/port.ts',{'share/main/lib/util':{handleEvent(){}}}),calls=[]
 const context={...ctx(''),host:async args=>{calls.push(args);return args.includes('rm')?'success':'OK'}}
 await api.forward('h','tcp:1000','tcp:2000',context);await api.reverse('h','tcp:4000','tcp:3000',context)
 await api.removeForward('h','tcp:1000','tcp:2000',context);await api.removeReverse('h','tcp:4000','tcp:3000',context)
 assert.deepEqual(calls,[['fport','tcp:1000','tcp:2000'],['rport','tcp:4000','tcp:3000'],['fport','rm','tcp:1000','tcp:2000'],['fport','rm','tcp:4000','tcp:3000']])
 await assert.rejects(api.forward('h','tcp:1','tcp:2',ctx('error')),/confirm/)
})
