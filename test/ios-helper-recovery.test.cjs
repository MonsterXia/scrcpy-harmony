const {test}=require('node:test'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream')
const load=require('./helpers/load-ios.cjs')
test('a stalled verification times out independently of time spent entering the code',async context=>{
 context.mock.timers.enable({apis:['setTimeout']})
 const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),kill(){setImmediate(()=>this.emit('close',null))}})
 const {IosHelper}=load('src/main/lib/ios-provisioning/helper.ts',{
  'node:child_process':{spawn:()=>child},'node:fs/promises':{mkdtemp:async()=>'/synthetic',chmod:async()=>{},rm:async()=>{}},
  '../devices/ios-wda':{},
 })
 const helper=new IosHelper('/synthetic','scope');helper.verified=Promise.resolve()
 let challenged
 const ready=new Promise(resolve=>challenged=resolve)
 const login=helper.run('sign',{op:'login'},challenged,new AbortController().signal)
 await new Promise(setImmediate)
 child.stdout.write('{"event":"challenge","challenge":{"numbers":[]}}\n');await ready
 context.mock.timers.tick(90000)
 helper.reply({action:'code',code:'123456'})
 const timedOut=assert.rejects(login,/timeout/)
 context.mock.timers.tick(60000);await timedOut
})
test('recovering an obsolete reservation preserves a foreign session busy state',async()=>{
 let held={runnerId:'old-runner-123',sessionId:'old-session'},inspections=0
 const inspected={ready:true,busy:true,installed:true,expiresAt:9e12,developerMode:true,availability:'available'}
 const spawn=()=>{
  const child=new EventEmitter()
  Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),exitCode:null,killed:false,kill(){this.killed=true}})
  const result={...inspected,expiresAt:++inspections===1?9e12:8e12}
  setImmediate(()=>{child.stdout.write(JSON.stringify({result})+'\n');child.exitCode=0;child.emit('close',0)})
  return child
 }
 const {IosHelper}=load('src/main/lib/ios-provisioning/helper.ts',{
  'node:child_process':{spawn},'node:fs/promises':{mkdtemp:async()=>'/synthetic',chmod:async()=>{},rm:async()=>{}},
  '../devices/ios-wda':{WdaClient:class{async request(method){assert.equal(method,'GET');return {sessionId:'foreign-session',value:{ready:true,scrcpyPlusProtocolVersion:1,scrcpyPlusRunnerId:'new-runner-123'}}}}},
 })
 const helper=new IosHelper('/synthetic','a'.repeat(64));helper.verified=Promise.resolve()
 helper.journal=()=>({load:async()=>held,clear:async()=>{held=undefined}})
 const result=await helper.run('device',{op:'inspect',udid:'01234567',bundleId:'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.TEAM123456'},()=>{},new AbortController().signal)
 assert.equal(held,undefined);assert.equal(result.busy,true);assert.equal(result.expiresAt,8e12)
})
