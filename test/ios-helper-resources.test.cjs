const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto')
const load=require('./helpers/load-ios.cjs')
const {IosHelper}=load('src/main/lib/ios-provisioning/helper.ts',{'../devices/ios-wda':{WdaClient:class {}}})
// Frozen Python's transitive metadata exceeds 5,000 files. A lower runtime
// limit than the packaging validator must fail this real-filesystem fixture.
test('packaging and runtime accept a complete frozen helper with more than 5000 resources',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ios-resources-test-'))
 t.after(()=>fs.rm(root,{recursive:true,force:true}))
 await fs.mkdir(path.join(root,'device'))
 const suffix=process.platform==='win32'?'.exe':''
 const names=['ios-sign'+suffix,'device/ios-device'+suffix,'WDA.ipa','THIRD_PARTY_NOTICES.txt',...Array.from({length:5100},(_,i)=>`device/metadata-${i}`)]
 const contents='fixture',sha256=createHash('sha256').update(contents).digest('hex')
 for(let i=0;i<names.length;i+=100)await Promise.all(names.slice(i,i+100).map(n=>fs.writeFile(path.join(root,n),contents)))
 const manifest={version:1,platform:process.platform,arch:process.arch,files:names.map(file=>({file,sha256}))}
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest))
 const {validateIosProvisioning}=await import('../script/ios-provisioning-resources.mjs')
 await validateIosProvisioning(root)
 await new IosHelper(root,'a'.repeat(64),false).verify()
 await fs.writeFile(path.join(root,'WDA.ipa'),'tampered')
 await assert.rejects(new IosHelper(root,'a'.repeat(64),false).verify(),/helper-unavailable/)
 manifest.files=Array.from({length:20001},()=>manifest.files[0])
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest))
 await assert.rejects(validateIosProvisioning(root),/iOS helper platform mismatch/)
 await assert.rejects(new IosHelper(root,'a'.repeat(64),false).verify(),/helper-unavailable/)
})
