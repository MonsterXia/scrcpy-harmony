const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-automation.cjs')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
test('binary artifacts roundtrip empty logs and XML without relaxing frame validation',async()=>{
 const wire=load('src/common/automation/wire.ts'),{writeArtifact}=load('src/cli/files.ts')
 for(const bytes of [Buffer.alloc(0),Buffer.from('<Hierarchy/>')]){
  const data={artifact:{artifactId:'a',mimeType:'text/plain',byteLength:bytes.length},bytes}
  const encoded=wire.encodeResult({apiVersion:1,requestId:'r',ok:true,data})
  assert.equal(encoded.type,'application/vnd.scrcpy-plus.blob')
  const decoded=wire.decodeResult(encoded.body,encoded.type);assert.deepEqual(decoded.data.bytes,bytes)
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'automation-artifact-'))
  try{const dest=path.join(dir,'log.txt');const result=await writeArtifact(decoded.data,dest,false);assert.equal(result.path,dest);assert.deepEqual(await fs.readFile(dest),bytes);await assert.rejects(writeArtifact(decoded.data,dest,false),{code:'INVALID_ARGUMENT'})}finally{await fs.rm(dir,{recursive:true,force:true})}
 }
 assert.throws(()=>wire.encodeResult({ok:true,data:{frame:{},bytes:Buffer.alloc(0)}}),{code:'INTERNAL'})
})
test('layout SDK waits are bounded and late bootstrap never starts capture; log adapter exports bytes',async()=>{
 const {createHarmonyToolHandlers}=load('src/main/automation/adapters/harmonyTools.ts');let finish,captures=0
 const deps={discover:async()=>({targets:[{key:'h',platform:'harmony',state:'ready'}],errors:[]}),shell:async()=>'',layout:async(_key,c)=>{await c.wait(()=>new Promise(r=>finish=r));captures++;return '<H/>'},logs:async(_key,d,m,c)=>c.captureHost(['shell','hilog'],d,m),captureHost:async(_key,args,c,d,m)=>{assert.deepEqual(args,['shell','hilog']);return{bytes:Buffer.alloc(0),truncated:false,durationMs:d}}}
 const h=createHarmonyToolHandlers(deps),ctx={clientId:'c',deadline:Date.now()+40,signal:new AbortController().signal}
 await assert.rejects(h['layout.dump']({device:'h'},ctx),{code:'TIMEOUT'});finish();await new Promise(r=>setImmediate(r));assert.equal(captures,0)
 const result=await h['logs.capture']({device:'h',durationMs:10},{...ctx,deadline:Date.now()+1000});assert.equal(result.artifact.byteLength,0);assert.equal(result.artifact.durationMs,10)
 const abort=new AbortController(),pending=h['layout.dump']({device:'h'},{...ctx,deadline:Date.now()+1000,signal:abort.signal});await new Promise(r=>setImmediate(r));abort.abort();await assert.rejects(pending,{code:'CANCELLED'});finish()
})
