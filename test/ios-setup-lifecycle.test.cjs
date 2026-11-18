const {test}=require('node:test'),assert=require('node:assert/strict')
const load=require('./helpers/load-ios.cjs')
function fixture(run, data) {
 return load('src/main/lib/ios-provisioning/index.ts',{
  electron:{app:{getPath:()=>'/synthetic',getAppPath:()=>'/synthetic',isPackaged:false}},
  'node:fs/promises':{readFile:async()=>{if(data)return JSON.stringify(data);throw Error('ENOENT')}},
  './helper':{IosHelper:class {async run(_kind,request,_event,signal){return run(request,signal)}}},
 })
}
test('window cancellation while restoring account prevents later login',async()=>{
 let restore;const calls=[]
 const api=fixture(async request=>{calls.push(request.op);if(request.op==='account')return new Promise(r=>restore=r);return {authenticated:true,teams:[]}})
 const controller=new AbortController()
 const pending=api.iosSetup('01234567',{action:'login',email:'test@example.com',password:'synthetic'},controller.signal)
 await new Promise(setImmediate);controller.abort(Error('cancelled'));restore({authenticated:false})
 await assert.rejects(pending,/cancelled/);assert.deepEqual(calls,['account'])
})
test('cancelled automatic connection cannot renew after shared account restore finishes',async()=>{
 let restore;const calls=[]
 const binding={teamId:'TEAM123456',bundleId:'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.TEAM123456'}
 const api=fixture(async request=>{calls.push(request.op);if(request.op==='account')return new Promise(r=>restore=r);throw Error('unexpected device work')},{devices:{'01234567':binding}})
 const controller=new AbortController()
 const pending=api.prepareManagedIos('01234567',controller.signal)
 await new Promise(setImmediate);controller.abort(Error('cancelled'));restore({authenticated:true,teams:[{id:'TEAM123456'}]})
 await assert.rejects(pending,/cancelled/);assert.deepEqual(calls,['account'])
})
test('window cancellation reaches an already running helper login',async()=>{
 let helperSignal,finish
 const api=fixture(async(request,signal)=>{
  if(request.op==='account')return {authenticated:false}
  helperSignal=signal;return new Promise(r=>finish=r)
 })
 const controller=new AbortController()
 const pending=api.iosSetup('01234567',{action:'login',email:'test@example.com',password:'synthetic'},controller.signal)
 await new Promise(setImmediate);controller.abort(Error('cancelled'));finish({authenticated:true,teams:[]})
 const state=await pending
 assert.equal(helperSignal.aborted,true);assert.equal(state.phase,'cancelled');assert.equal(state.authenticated,false)
})
