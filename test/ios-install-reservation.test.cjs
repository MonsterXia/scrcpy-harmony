const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-ios.cjs')
const {reserveWda}=load('src/main/lib/ios-provisioning/reservation.ts')
test('installer claims an idle runner and releases only its own session',async()=>{
 const calls=[];let sessionId;const client={request:async(method,path)=>{calls.push([method,path]);if(path==='/status')return {sessionId,value:{ready:true,scrcpyPlusProtocolVersion:1,scrcpyPlusRunnerId:'runner-12345'}};if(path==='/session'){sessionId='owned-session';return {value:{sessionId}}};return {}}}
 const release=await reserveWda(client,new AbortController().signal);await release();assert.equal(calls.at(-1)[1],'/session/owned-session')
})
test('busy runner and lost create acknowledgement never permit installation',async()=>{
 await assert.rejects(reserveWda({request:async()=>({sessionId:'foreign',value:{ready:true}})},new AbortController().signal))
 await assert.rejects(reserveWda({request:async(m,p)=>{if(p==='/status')return {value:{ready:true,scrcpyPlusProtocolVersion:1,scrcpyPlusRunnerId:'runner-12345'}};throw Error('lost')}},new AbortController().signal))
})
test('failed cleanup retains ownership and retries only its session on reconnect',async()=>{
 let saved,failed=false,sessionId
 const journal={load:async()=>saved,save:async v=>{saved=v},clear:async()=>{saved=undefined}}
 const client={request:async(m,p)=>{
  if(failed)throw Error('offline')
  if(p==='/status')return {sessionId,value:{ready:true,scrcpyPlusProtocolVersion:1,scrcpyPlusRunnerId:'runner-12345'}}
  if(p==='/session'){sessionId='reserved';return {value:{sessionId}}}
  if(m==='DELETE'){assert.equal(p,'/session/reserved');sessionId=undefined;return {}}
 }}
 const release=await reserveWda(client,new AbortController().signal,journal);failed=true;await assert.rejects(release());assert.equal(saved.sessionId,'reserved')
 failed=false;const {cleanupReservation}=load('src/main/lib/ios-provisioning/reservation.ts');await cleanupReservation(client,journal);assert.equal(saved,undefined);assert.equal(sessionId,undefined)
})
test('cancel while persisting reservation before POST clears the undispatched journal',async()=>{
 let saved,posts=0;const controller=new AbortController()
 const journal={load:async()=>saved,save:async v=>{saved=v;controller.abort()},clear:async()=>{saved=undefined}}
 const client={request:async(m)=>{if(m==='POST')posts++;return {value:{ready:true,scrcpyPlusProtocolVersion:1,scrcpyPlusRunnerId:'runner-12345'}}}}
 await assert.rejects(reserveWda(client,controller.signal,journal));assert.equal(posts,0);assert.equal(saved,undefined)
})
