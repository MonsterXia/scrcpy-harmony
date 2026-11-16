const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-automation.cjs'),{execFile}=require('node:child_process'),{promisify}=require('node:util')
const exec=promisify(execFile),ctx=()=>({clientId:'test',deadline:Date.now()+1000,signal:new AbortController().signal})
test('one-shot shell preserves command quoting and returns its actual exit status',{skip:process.platform==='win32'},async()=>{
 const {runOneShotShell}=load('src/main/automation/adapters/oneShotShell.ts')
 const transport=async command=>(await exec('/bin/sh',['-c',command])).stdout
 const result=await runOneShotShell("printf '%s' 'space;中文'; exit 9",131072,ctx(),transport)
 assert.equal(result.output,'space;中文');assert.equal(result.exitCode,9);assert.equal(result.truncated,false)
})
test('shell output truncation is explicit and missing completion never looks successful',async()=>{
 const {runOneShotShell}=load('src/main/automation/adapters/oneShotShell.ts')
 const result=await runOneShotShell('read',4,ctx(),async command=>{
 const marker=command.match(/SCRCPY_SHELL_([a-f0-9-]+):/)[0];return 'abcdef\n'+marker+'0\n'
 });assert.equal(result.output,'abcd');assert.equal(result.truncated,true)
 await assert.rejects(runOneShotShell('read',4,ctx(),async()=> 'partial output'),{code:'OUTCOME_UNKNOWN'})
})
