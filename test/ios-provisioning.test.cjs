const {test}=require('node:test')
const assert=require('node:assert/strict')
const load=require('./helpers/load-ios.cjs')
const {IosProvisioning}=load('src/main/lib/ios-provisioning/manager.ts')
function fixture(options={}) {
 let now=1000000000, saved, busy=false
 const calls=[], events=[]
 const binding={teamId:'TEAM123456',bundleId:'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.TEAM123456'}
 const data={team:binding,devices:{'01234567':binding}}
 const adapter={
  run:async(kind,payload,emit,signal)=>{
   calls.push([kind,payload.op]); if(options.run) return options.run(kind,payload,emit,signal)
   if(payload.op==='inspect')return {installed:true,expiresAt:now+7*86400000,ready:true,busy:false,developerMode:true,...options.inspect}
   if(payload.op==='account')return {authenticated:true,teams:[{id:'TEAM123456',name:'Personal Team'}]}
   return {ready:true}
  },
  save:async d=>{saved=d},isBusy:()=>busy,now:()=>now
 }
 const manager=new IosProvisioning(adapter,data,s=>events.push(s))
 return {manager,calls,events,binding,setBusy:v=>busy=v,advance:n=>now+=n,saved:()=>saved}
}
test('healthy installation is inspected but never resigned',async()=>{
 const f=fixture();await f.manager.prepare('01234567');assert.deepEqual(f.calls,[['device','inspect']])
})
test('due profile renews before startup and persists only binding',async()=>{
 let inspections=0
 const f=fixture({run:async(kind,p)=>p.op==='inspect'?{installed:true,expiresAt:++inspections===1?1:9e12,ready:false,busy:false,developerMode:true}: {ready:true}})
 await f.manager.prepare('01234567');assert.deepEqual(f.calls.map(x=>x[1]),['inspect','install','inspect','start']);assert.equal(f.saved().devices['01234567'].teamId,'TEAM123456')
})
test('active desktop or foreign WDA session is never reinstalled',async()=>{
 const f=fixture({inspect:{expiresAt:1,busy:true}});await f.manager.prepare('01234567');assert.equal(f.calls.length,1)
 f.setBusy(true);await f.manager.prepare('01234567');assert.equal(f.calls.length,1)
})
test('simultaneous preparation is deduplicated',async()=>{
 const f=fixture();await Promise.all([f.manager.prepare('01234567'),f.manager.prepare('01234567')]);assert.equal(f.calls.length,1)
})
test('post-install missing profile fails before launch',async()=>{
 const f=fixture({inspect:{installed:false,expiresAt:null,ready:false}})
 await assert.rejects(f.manager.prepare('01234567'));assert.equal(f.calls.some(x=>x[1]==='start'),false)
})
test('renewal visits only known connected idle devices and backs off failures',async()=>{
 const f=fixture({run:async()=>{throw new Error('device-error')}})
 await f.manager.renew(['different']);assert.equal(f.calls.length,0)
 await f.manager.renew(['01234567']);await f.manager.renew(['01234567']);assert.equal(f.calls.length,1)
 f.advance(16*60000);await f.manager.renew(['01234567']);assert.equal(f.calls.length,2)
})
test('cancel aborts preparation and blocks late installation',async()=>{
 let resume
 const f=fixture({run:()=>new Promise(r=>resume=r)})
 const pending=f.manager.prepare('01234567');await Promise.resolve();f.manager.cancel('01234567');resume({installed:false,ready:false})
 await assert.rejects(pending);assert.equal(f.calls.length,1)
})
test('unmanaged device cannot silently borrow account or install',async()=>{
 const f=fixture();await assert.rejects(f.manager.prepare('01234568',false));assert.equal(f.calls.length,0)
})
test('cancelling team selection during save cannot start installation',async()=>{
 let resolveSave;const calls=[]
 const m=new IosProvisioning({now:()=>0,isBusy:()=>false,save:()=>new Promise(r=>resolveSave=r),run:async(k,p)=>{calls.push(p.op);return {authenticated:true,teams:[{id:'TEAM123456'}]}}},{devices:{}},()=>{})
 await m.restore();const selected=m.selectTeam('01234567','TEAM123456');m.cancel('01234567');resolveSave();await assert.rejects(selected);assert.deepEqual(calls,['account'])
})
test('late restore cannot overwrite successful login',async()=>{
 let finishRestore
 const m=new IosProvisioning({now:()=>0,isBusy:()=>false,save:async()=>{},run:async(k,p)=>p.op==='account'?new Promise(r=>finishRestore=r):{authenticated:true,teams:[{id:'TEAM123456'}]}},{devices:{}},()=>{})
 const pending=m.restore();await m.login('01234567','test@example.com','not-a-real-password');finishRestore({authenticated:false});await pending;assert.equal(m.status('01234567').authenticated,true)
})
test('unknown WDA availability never allows renewal',async()=>{
 const f=fixture({inspect:{installed:true,expiresAt:1,ready:false,busy:false,availability:'unknown'}})
 await assert.rejects(f.manager.prepare('01234567'));assert.equal(f.calls.length,1)
})
test('reauthorization keeps signing credentials and device bindings',async()=>{
 const f=fixture();await f.manager.restore();f.manager.reauthorize('01234567');assert.equal(f.manager.status('01234567').phase,'login');assert.equal(f.manager.managed('01234567'),true);assert.deepEqual(f.calls,[['sign','account']])
})
test('submitted 2FA disables duplicate replies until a new challenge arrives',async()=>{
 let finish,emit
 const m=new IosProvisioning({now:()=>0,isBusy:()=>false,save:async()=>{},run:async(k,p,event)=>{emit=event;return new Promise(r=>finish=r)}},{devices:{}},()=>{})
 const pending=m.login('01234567','test@example.com','not-a-real-password');emit({event:'challenge',challenge:{sms:false,unknown:false,numbers:[]}})
 assert.equal(m.canReply('01234567'),true);assert.equal(m.canReply('01234568'),false)
 m.challengeSubmitted('01234567','code');assert.equal(m.canReply('01234567'),false)
 assert.equal(m.status('01234567').phase,'verifying')
 emit({event:'challenge',challenge:{sms:false,unknown:false,numbers:[],retry:true}})
 assert.equal(m.status('01234567').error,'invalid-code')
 m.challengeSubmitted('01234567','devices');assert.equal(m.status('01234567').phase,'sending')
 finish({authenticated:true,teams:[]});await pending
})
test('logout excludes account and device work until its helper and persistence finish',async()=>{
 let finishHelper,finishSave
 const calls=[]
 const binding={teamId:'TEAM123456',bundleId:'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.TEAM123456'}
 const m=new IosProvisioning({now:()=>0,isBusy:()=>false,
  save:()=>new Promise(r=>finishSave=r),
  run:async(k,p)=>{calls.push(p.op);if(p.op==='logout')return new Promise(r=>finishHelper=r);return {authenticated:true,teams:[{id:'TEAM123456'}]}}
 },{team:binding,devices:{'01234567':binding}},()=>{})
 await m.restore();const pending=m.logout('01234567')
 const excludes=async()=>{
  await assert.rejects(m.login('01234568','test@example.com','synthetic'),/busy/)
  await assert.rejects(m.prepare('01234567'),/busy/)
  await assert.rejects(m.logout('01234568'),/busy/)
  await assert.rejects(m.selectTeam('01234568','TEAM123456'),/team-unavailable/)
  await m.renew(['01234567']);assert.deepEqual(calls,['account','logout'])
 }
 await excludes();finishHelper({authenticated:false});await new Promise(setImmediate)
 await excludes();finishSave();await pending
 await m.login('01234568','test@example.com','synthetic');assert.equal(m.status('01234568').authenticated,true)
})
test('disposed manager rejects logout without touching saved credentials',async()=>{
 const f=fixture();f.manager.dispose();await assert.rejects(f.manager.logout('01234567'))
 assert.deepEqual(f.calls,[])
})
test('closing a waiter does not cancel the existing background renewal',async()=>{
 let finish,operationSignal
 const f=fixture({run:async(_kind,_payload,_event,signal)=>{operationSignal=signal;return new Promise(r=>finish=r)}})
 const renewal=f.manager.prepare('01234567',false)
 const controller=new AbortController()
 const waiter=f.manager.prepare('01234567',false,controller.signal)
 const rejected=assert.rejects(waiter,/cancelled/)
 controller.abort(Error('cancelled'))
 // The shared job finishes successfully even though the joined caller left.
 finish({installed:true,expiresAt:9e12,ready:true,busy:false,developerMode:true})
 await rejected;await renewal
 assert.equal(operationSignal.aborted,false);assert.equal(f.manager.status('01234567').phase,'ready')
})

test('runner recovery uses the saved device binding without signing or adopting other devices', async () => {
 const f=fixture({run:async(kind,payload)=>{
   assert.equal(kind,'device')
   assert.equal(payload.bundleId,f.binding.bundleId)
   return {ready:true,runnerBundleId:payload.bundleId}
 }})
 const signal=new AbortController().signal
 await assert.rejects(f.manager.recoverRunner('12345678',signal),/not-installed/)
 await f.manager.recoverRunner('01234567',signal)
 assert.deepEqual(f.calls,[['device','recover']])
})

test('preparation requested during recovery still checks the installed artifact and profile', async () => {
 let finishRecovery
 const f=fixture({run:async(_kind,request)=>{
   if(request.op==='recover') return new Promise(resolve=>{finishRecovery=resolve})
   return {installed:true,expiresAt:9e12,ready:true,busy:false,developerMode:true}
 }})
 const recovery=f.manager.recoverRunner('01234567',new AbortController().signal)
 const preparation=f.manager.prepare('01234567')
 finishRecovery({ready:true,runnerBundleId:f.binding.bundleId})
 await Promise.all([recovery,preparation])
 assert.deepEqual(f.calls.map(([,op])=>op),['recover','inspect'])
 assert.equal(f.manager.status('01234567').phase,'ready')
})

test('recovery preserves a busy result from the final reservation reinspection', async () => {
 const f=fixture({run:async(_kind,request)=>({ready:true,busy:true,runnerBundleId:request.bundleId})})
 await assert.rejects(f.manager.recoverRunner('01234567',new AbortController().signal),/busy/)
})
