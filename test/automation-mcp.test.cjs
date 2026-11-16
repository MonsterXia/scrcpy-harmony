const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const {buildSync}=require('esbuild'),load=require('./helpers/load-automation.cjs')
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio')
let root,entry
before(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'plus-mcp-'));entry=path.join(root,'mcp.cjs');buildSync({entryPoints:['src/mcp/index.ts'],bundle:true,platform:'node',format:'cjs',outfile:entry})})
after(async()=>{if(root)await fs.rm(root,{recursive:true,force:true})})
async function fixture(t,dispatch,protocolVersion){
 const profilePath=await fs.mkdtemp(path.join(os.tmpdir(),'plus-mcp-profile-'));t.after(()=>fs.rm(profilePath,{recursive:true,force:true}))
 const server=await load('src/main/automation/server.ts').startAutomationServer({profilePath,dispatch});t.after(()=>server.close())
 const transport=new StdioClientTransport({command:process.execPath,args:[entry,'--profile',profilePath,'--client','mcp-test'],stderr:'pipe'})
 let stderr='';transport.stderr?.on('data',data=>stderr+=data)
 const client=new Client({name:'automation-test',version:'1'},{versionNegotiation:{mode:protocolVersion==='2025-11-25'?'legacy':{pin:'2026-07-28'}}});await client.connect(transport);t.after(()=>client.close())
 return {client,profilePath,stderr:()=>stderr}
}
const ok=(r,data)=>({apiVersion:1,requestId:r.requestId,ok:true,data})
test('real SDK stdio lists shared schemas, validates before dispatch and preserves structured errors',async t=>{
 let calls=0;const f=await fixture(t,async r=>{calls++;return r.operation==='input.key'?{apiVersion:1,requestId:r.requestId,ok:false,error:{code:'UNSUPPORTED',message:'view only',retryable:false,outcome:'not-started'}}:ok(r,{devices:[]})})
 const {tools}=await f.client.listTools();const schema=load('src/common/automation/protocol.ts').operations
 assert.equal(tools.length,Object.keys(schema).length)
 const tap=tools.find(t=>t.name==='input_tap');assert.equal(tap.inputSchema.additionalProperties,false);assert.equal(tap.annotations.readOnlyHint,false);assert.equal(tap.annotations.destructiveHint,true)
 assert.equal(tools.find(t=>t.name==='screen_capture').annotations.readOnlyHint,true)
 const invalid=await f.client.callTool({name:'input_tap',arguments:{session:'s',frame:'f',x:-1,y:1}});assert.equal(invalid.isError,true);assert.equal(calls,0)
 const devices=await f.client.callTool({name:'devices_list',arguments:{}});assert.equal(devices.structuredContent.ok,true);assert.equal(calls,1)
 const unsupported=await f.client.callTool({name:'input_key',arguments:{session:'ios',key:'home'}});assert.equal(unsupported.isError,true);assert.equal(unsupported.structuredContent.error.code,'UNSUPPORTED')
 assert.equal(f.stderr(),'')
})
test('MCP returns native image and embedded file bytes with metadata, including empty logs, on legacy clients',async t=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS6kAAAAASUVORK5CYII=','base64')
 const f=await fixture(t,async r=>ok(r,r.operation==='screen.capture'?{frame:{frameId:'f',mimeType:'image/png'},bytes:png}:{artifact:{artifactId:'00000000-0000-4000-8000-000000000000',mimeType:'text/plain',byteLength:0},bytes:Buffer.alloc(0)}),'2025-11-25')
 const frame=await f.client.callTool({name:'screen_capture',arguments:{session:'s'}});assert.deepEqual(Buffer.from(frame.content.find(c=>c.type==='image').data,'base64'),png);assert.equal(frame.structuredContent.data.frame.frameId,'f');assert.equal(frame.structuredContent.data.bytes,undefined)
 const log=await f.client.callTool({name:'logs_capture',arguments:{device:'h'}});assert.equal(log.content.find(c=>c.type==='resource').resource.blob,'');assert.equal(log.structuredContent.data.artifact.byteLength,0)
})
test('stdio cancellation reaches HTTP work without retries; connection remains usable',async t=>{
 let start,cancel,calls=0;const started=new Promise(r=>start=r),cancelled=new Promise(r=>cancel=r)
 const f=await fixture(t,async(r,c)=>{calls++;if(r.operation==='shell.run'){start();c.signal.addEventListener('abort',cancel,{once:true});return new Promise(()=>{})}return ok(r,{ready:true})})
 const abort=new AbortController();const pending=f.client.callTool({name:'shell_run',arguments:{device:'h',command:'wait'}},{signal:abort.signal});await started;abort.abort();await assert.rejects(pending)
 await Promise.race([cancelled,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('cancellation not forwarded')),2000);timer.unref()})])
 const status=await f.client.callTool({name:'service_status',arguments:{}});assert.equal(status.structuredContent.ok,true);assert.equal(calls,2)
})
