const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const load=require('./helpers/load-automation.cjs')
test('screenshot writes atomically without overwriting an existing file by default',async t=>{
 const {writeScreenshot}=load('src/cli/files.ts');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'plus-image-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'截图.png')
 const result={frame:{frameId:'f'},bytes:Buffer.from('png')}
 assert.equal((await writeScreenshot(result,file,false)).path,file);assert.equal(await fs.readFile(file,'utf8'),'png')
 await assert.rejects(writeScreenshot({...result,bytes:Buffer.from('next')},file,false),{code:'INVALID_ARGUMENT'})
 assert.equal(await fs.readFile(file,'utf8'),'png');assert.deepEqual(await fs.readdir(dir),['截图.png'])
 await writeScreenshot({...result,bytes:Buffer.from('next')},file,true);assert.equal(await fs.readFile(file,'utf8'),'next')
})
test('private text input is bounded, cancellable and decoded as UTF-8',async()=>{
 const {readText}=load('src/cli/files.ts');const context={deadline:Date.now()+100,signal:new AbortController().signal}
 const stream=(async function*(){yield Buffer.from('中文')})()
 assert.equal(await readText(stream,context),'中文')
 await assert.rejects(readText((async function*(){yield Buffer.alloc(65537)})(),context),{code:'INVALID_ARGUMENT'})
 await assert.rejects(readText((async function*(){await new Promise(()=>{})})(),{...context,deadline:Date.now()+20}),{code:'TIMEOUT'})
})
