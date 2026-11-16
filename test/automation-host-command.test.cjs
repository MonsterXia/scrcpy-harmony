const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const load=require('./helpers/load-automation.cjs'),{spawn}=require('node:child_process')
const host=()=>load('src/main/lib/hdc/hostCommand.ts',{'node:child_process':{spawn:(bin,args,options)=>spawn(process.execPath,[bin,...args],options)}})
const context=()=>({clientId:'test',deadline:Date.now()+1000,signal:new AbortController().signal})
async function fixture(t,body){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'plus-hdc-host-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'fake hdc tool');await fs.writeFile(file,'#!'+process.execPath+'\n'+body,{mode:0o700});return file}
test('HDC host command preserves argv boundaries and explicit target/server without a shell',async t=>{
 const file=await fixture(t,'process.stdout.write(JSON.stringify(process.argv.slice(2)))');const {runHostCommand}=host()
 const result=await runHostCommand({bin:file,host:'127.0.0.1',port:18710},'device-1',['install','-r','/tmp/中文 x;$(not-executed).hap'],context())
 assert.deepEqual(JSON.parse(result),['-s','127.0.0.1:18710','-t','device-1','install','-r','/tmp/中文 x;$(not-executed).hap'])
})
test('deadline terminates only the owned host process and reports unconfirmed device outcome',async t=>{
 const file=await fixture(t,'setInterval(()=>{},1000)');const {runHostCommand}=host()
 await assert.rejects(runHostCommand({bin:file,host:'127.0.0.1',port:8710},'h',['install','x.hap'],{...context(),deadline:Date.now()+30}),{code:'TIMEOUT',outcome:'unknown'})
})
test('nonzero status and oversized stdout are failures rather than partial successes',async t=>{
 const {runHostCommand}=host()
 const fail=await fixture(t,'process.stdout.write("partial");process.exitCode=2');await assert.rejects(runHostCommand({bin:fail,host:'127.0.0.1',port:8710},'h',['install','x'],context()),{code:'OUTCOME_UNKNOWN'})
 const big=await fixture(t,'process.stdout.write("x".repeat(1024*1024+1))');await assert.rejects(runHostCommand({bin:big,host:'127.0.0.1',port:8710},'h',['install','x'],context()),{code:'OUTCOME_UNKNOWN'})
})
test('finite log capture stops its own reader and marks bounded output truncation',async t=>{
 const {captureHostOutput}=host();const file=await fixture(t,'process.stdout.write("x".repeat(100));setInterval(()=>{},1000)')
 const result=await captureHostOutput({bin:file,host:'127.0.0.1',port:8710},'h',['shell','hilog'],context(),500,16)
 assert.equal(result.bytes.length,16);assert.equal(result.truncated,true)
})
test('finite log duration ends a quiet reader without reporting a command failure',async t=>{
 const {captureHostOutput}=host();const file=await fixture(t,'setInterval(()=>{},1000)')
 const result=await captureHostOutput({bin:file,host:'127.0.0.1',port:8710},'h',['shell','hilog'],context(),50,1024)
 assert.equal(result.bytes.length,0);assert.equal(result.truncated,false)
})
