const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),load=require('./helpers/load-automation.cjs')
const ctx=()=>({clientId:'test',deadline:Date.now()+1000,signal:new AbortController().signal})
test('installation validates and stages a private lowercase HAP without shell interpolation',async t=>{
 const {withInstallationSource}=load('src/main/automation/adapters/installSource.ts');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'plus-hap-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const source=path.join(dir,'中文 a;file.HAP'),bytes=Buffer.from([0x50,0x4b,3,4,0,1,2]);await fs.writeFile(source,bytes)
 let staged;await withInstallationSource(source,ctx(),async file=>{staged=file;assert.equal(path.extname(file),'.hap');assert.notEqual(file,source);assert.deepEqual(await fs.readFile(file),bytes);if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o077,0)})
 await assert.rejects(fs.access(staged));assert.deepEqual(await fs.readFile(source),bytes)
})
test('invalid install sources fail before dispatch and cleanup survives a rejected install',async t=>{
 const {withInstallationSource}=load('src/main/automation/adapters/installSource.ts');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'plus-hap-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let calls=0
 const bad=path.join(dir,'bad.hap');await fs.writeFile(bad,'not zip')
 for(const file of ['relative.hap',dir,bad])await assert.rejects(withInstallationSource(file,ctx(),async()=>{calls++}),{code:'INVALID_ARGUMENT'})
 assert.equal(calls,0)
 const good=path.join(dir,'good.hap');await fs.writeFile(good,Buffer.from([0x50,0x4b,3,4]));let staged
 await assert.rejects(withInstallationSource(good,ctx(),async file=>{staged=file;throw Error('install failed')}),/install failed/)
 await assert.rejects(fs.access(staged))
})
