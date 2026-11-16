const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path')
test('synchronous read failure racing cancellation does not leave an unhandled rejection',()=>{
 const result=spawnSync(process.execPath,['--unhandled-rejections=strict','-e',`
 const load=require(${JSON.stringify(path.resolve('test/helpers/load-automation.cjs'))})
 const {waitForRead}=load('src/main/automation/adapters/waitForRead.ts')
 const controller=new AbortController()
 waitForRead({clientId:'test',deadline:Date.now()+1000,signal:controller.signal},()=>{controller.abort();throw Error('SDK closed synchronously')}).catch(()=>{})
 `],{encoding:'utf8'})
 assert.equal(result.status,0,result.stderr)
})
