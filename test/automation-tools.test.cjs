const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-automation.cjs')
const ctx=()=>({clientId:'test',deadline:Date.now()+1000,signal:new AbortController().signal})
test('Harmony tool adapter fixes the target key and rejects unsupported/unready targets before business calls',async()=>{
 const {createHarmonyToolHandlers}=load('src/main/automation/adapters/harmonyTools.ts');const calls=[]
 const handlers=createHarmonyToolHandlers({discover:async()=>({targets:[{key:'h',platform:'harmony',state:'ready'},{key:'a',platform:'android',state:'ready'},{key:'u',platform:'harmony',state:'unavailable'}],errors:[]}),shell:async(key,command,context)=>{calls.push({key,command,signal:context.signal});return 'result'},overview:async(key,context)=>({value:await context.shell('read')}),appsList:async()=>[],appsInfo:async()=>[],appsTop:async()=>({}),processes:async()=>[]})
 for(const [device,code] of [['a','UNSUPPORTED'],['u','UNAVAILABLE'],['none','NOT_FOUND']])await assert.rejects(handlers['overview.get']({device},ctx()),{code})
 const result=await handlers['overview.get']({device:'h'},ctx());assert.deepEqual(result,{value:'result'});assert.equal(calls[0].key,'h');assert.equal(calls.length,1)
})
test('tool deadline/cancellation is checked between shared business reads without retrying',async()=>{
 const {createHarmonyToolHandlers}=load('src/main/automation/adapters/harmonyTools.ts');let calls=0;const abort=new AbortController()
 const handlers=createHarmonyToolHandlers({discover:async()=>({targets:[{key:'h',platform:'harmony',state:'ready'}],errors:[]}),shell:async()=>{calls++;abort.abort();return 'read'},overview:async(_key,c)=>{await c.shell('first');return c.shell('second')},appsList:async()=>[],appsInfo:async()=>[],appsTop:async()=>({}),processes:async()=>[]})
 await assert.rejects(handlers['overview.get']({device:'h'},{...ctx(),signal:abort.signal}),{code:'CANCELLED'});assert.equal(calls,1)
})
test('app identifiers cannot enter shell syntax and absent devices during provider errors are unavailable',async()=>{
 const {createHarmonyToolHandlers}=load('src/main/automation/adapters/harmonyTools.ts');let calls=0
 const deps={discover:async()=>({targets:[{key:'h',platform:'harmony',state:'ready'}],errors:[]}),shell:async()=>'',overview:async()=>({}),appsList:async()=>[],appsInfo:async()=>{calls++;return []},appsTop:async()=>({}),processes:async()=>[]}
 const handlers=createHarmonyToolHandlers(deps)
 await assert.rejects(handlers['apps.info']({device:'h',bundle:'app; rm x'},ctx()),{code:'INVALID_ARGUMENT'});assert.equal(calls,0)
 const failed=createHarmonyToolHandlers({...deps,discover:async()=>({targets:[],errors:['harmony']})});await assert.rejects(failed['overview.get']({device:'missing'},ctx()),{code:'UNAVAILABLE'})
})
test('shared base query uses the explicit bounded transport and rejects a different target context',async()=>{
 const base=load('src/main/lib/hdc/base.ts',{'share/main/lib/util':{handleEvent(){}},'share/common/log':()=>({debug(){}})})
 const commands=[],context={...ctx(),deviceKey:'h',shell:async command=>{commands.push(command);return 'PID %CPU TIME+ RES USER NAME ARGS\n1 0 0 1 root app app --flag'}}
 const rows=await base.getProcesses('h',context);assert.equal(rows[0].pid,'1');assert.equal(rows[0].args,'app --flag');assert.equal(commands.length,1)
 await assert.rejects(base.shell('other','read',context),/mismatch/)
})
test('application writes do not retry and distinguish validation from unconfirmed dispatch',async()=>{
 const {createHarmonyToolHandlers}=load('src/main/automation/adapters/harmonyTools.ts');let writes=0
 const deps={discover:async()=>({targets:[{key:'h',platform:'harmony',state:'ready'}],errors:[]}),shell:async()=>'',host:async()=>{writes++;throw Error('lost acknowledgement')},overview:async()=>({}),appsList:async()=>[],appsInfo:async()=>[],appsTop:async()=>({}),processes:async()=>[],writeApp:async(_action,_key,_p,c)=>c.host(['write'])}
 const handlers=createHarmonyToolHandlers(deps)
 await assert.rejects(handlers['apps.start']({device:'h',bundle:'good',ability:'Bad;cmd'},ctx()),{code:'INVALID_ARGUMENT',outcome:'not-started'})
 await assert.rejects(handlers['apps.uninstall']({device:'h',bundle:'good'},ctx()),{code:'OUTCOME_UNKNOWN',outcome:'unknown'});assert.equal(writes,1)
})
