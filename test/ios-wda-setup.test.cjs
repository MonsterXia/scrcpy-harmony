const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
test('WDA preparation validates explicit device/signing arguments before any build', async () => {
  assert.ok(fs.existsSync('script/ios-wda.mjs'), 'WDA preparation script exists')
  const { parseOptions, buildArguments } = await import('../script/ios-wda.mjs')
  assert.throws(()=>parseOptions(['run','--udid','bad;command','--team','ABCDEF1234']))
  assert.throws(()=>parseOptions(['run','--unsigned']))
  assert.throws(()=>parseOptions(['run','--udid','01234567']))
  assert.throws(()=>parseOptions(['build','--unexpected']))
  const opts=parseOptions(['run','--udid','01234567','--team','ABCDEF1234'])
  const args=buildArguments(opts,'/tmp/source with spaces','/tmp/build with spaces')
  assert.ok(args.includes('platform=iOS,id=01234567'))
  assert.ok(args.includes('DEVELOPMENT_TEAM=ABCDEF1234'))
  assert.equal(args.at(-1),'test')
  assert.equal(args.includes('-allowProvisioningUpdates'),false)
  const unsigned=buildArguments(parseOptions(['build','--unsigned']),'/tmp/src','/tmp/build')
  assert.ok(unsigned.includes('CODE_SIGNING_ALLOWED=NO'))
  assert.equal(unsigned.some(x=>x.startsWith('DEVELOPMENT_TEAM=')),false)
})

test('explicit provisioning for a device also allows its first registration', async () => {
  const { parseOptions, buildArguments } = await import('../script/ios-wda.mjs')
  const base=['run','--udid','01234567','--team','ABCDEF1234']
  const allowed=buildArguments(parseOptions([...base,'--allow-provisioning']),'/tmp/src','/tmp/build')
  assert.ok(allowed.includes('-allowProvisioningUpdates'))
  assert.ok(allowed.includes('-allowProvisioningDeviceRegistration'))
  assert.equal(buildArguments(parseOptions(base),'/tmp/src','/tmp/build').includes('-allowProvisioningDeviceRegistration'),false)
})

test('ownership patch is checksum-verified, reproducible and refuses unknown source',async()=>{
 const path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto')
 const {applyOwnershipPatch}=await import('../script/ios-wda.mjs')
 const manifest=JSON.parse(fs.readFileSync('vendor/ios-wda/manifest.json','utf8'))
 const patch=fs.readFileSync('vendor/ios-wda/'+manifest.sessionOwnershipPatch.file,'utf8')
 const hash=s=>createHash('sha256').update(s).digest('hex')
 assert.equal(hash(patch),manifest.sessionOwnershipPatch.sha256)
 const lines=patch.split('\n').filter(l=>!l.startsWith('---')&&!l.startsWith('+++')&&!l.startsWith('@@'))
 const before=lines.filter(l=>l.startsWith(' ')||l.startsWith('-')).map(l=>l.slice(1)).join('\n')+'\n'
 const after=lines.filter(l=>l.startsWith(' ')||l.startsWith('+')).map(l=>l.slice(1)).join('\n')+'\n'
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wda-patch-'))
 const target=path.join(temp,manifest.sessionOwnershipPatch.target)
 const spec={...manifest,sessionOwnershipPatch:{...manifest.sessionOwnershipPatch,sourceSha256:hash(before),patchedSha256:hash(after)}}
 try{
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,before)
  await applyOwnershipPatch(temp,spec);assert.equal(fs.readFileSync(target,'utf8'),after)
  await applyOwnershipPatch(temp,spec)
  fs.writeFileSync(target,'unexpected edits');await assert.rejects(applyOwnershipPatch(temp,spec),/Unexpected WDA source/)
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
})
