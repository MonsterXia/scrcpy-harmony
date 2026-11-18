// Validate the exact downloaded build and stage byte-identical public filenames.
import assert from 'node:assert/strict'
import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'
import { gunzipSync } from 'node:zlib'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { verifyMacUpdateMetadata, verifyTrustedMacArtifact } from '../../script/lib/macos-release.mjs'
const cfg=JSON.parse(await readFile(process.argv[2]));const root=path.resolve(cfg.root)
const source=JSON.parse(await readFile(path.join(root,'build-source.json')))
const localMac=JSON.parse(await readFile(path.join(root,'macos-release-arm64','1.0.5-dev.3','download-verification.json')))
assert.equal(localMac.sourceCommit,cfg.source);assert.equal(localMac.version,'1.0.5-dev.3');assert.equal(localMac.runUrl,source.runUrl)
for (const key of ['appSignature','appTicket','appGatekeeper','dmgSignature','dmgTicket','dmgGatekeeper','updateMetadata','blockmap']) assert.equal(localMac.downloadedArtifact?.[key],'passed',`Missing local Mac verification: ${key}`)
assert.equal(source.sourceCommit,cfg.source);assert.equal(source.runId,cfg.run)
assert.match(cfg.operationsCommit,/^[a-f0-9]{40}$/)
for (const name of ['fetch-artifacts.py','prepare-assets.mjs','verify-release.py','verify-downloaded-mac.mjs','check-client.mjs','check-source.mjs']) {
  const relative='release/dev3-tools/'+name
  assert.ok((await readFile(relative)).equals(execFileSync('git',['show',`${cfg.operationsCommit}:${relative}`])),`Release tool changed: ${name}`)
}
const version='1.0.5-dev.3';const out=path.join(root,'assets')
await mkdir(out)
const records=[]
async function stage(file,name=path.basename(file)) {
  assert.match(name,/^[A-Za-z0-9._-]+$/)
  const bytes=await readFile(file);assert.ok(bytes.length>0)
  await copyFile(file,path.join(out,name),1)
  records.push({name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
}
for (const [artifact,ext,metadata,reportName] of [
  ['windows-release-x64','win-x64.exe','latest.yml','verification-win-x64.json'],
  ['macos-release-arm64','mac-arm64.dmg','latest-mac.yml','verification-mac-arm64.json'],
]) {
  const directory=path.join(root,artifact,version)
  const filename=`Scrcpy Plus-${version}-${ext}`, safe=filename.replaceAll(' ','-'), file=path.join(directory,filename)
  const bytes=await readFile(file), sha512=createHash('sha512').update(bytes).digest('base64'), sha256=createHash('sha256').update(bytes).digest('hex')
  const info=yaml.load(await readFile(path.join(directory,metadata),'utf8'))
  assert.equal(info.version,version);assert.equal(info.path,safe);assert.equal(info.sha512,sha512)
  assert.equal(info.files.length,1);assert.equal(info.files[0].url,safe);assert.equal(info.files[0].size,bytes.length);assert.equal(info.files[0].sha512,sha512)
  const report=JSON.parse((await readFile(path.join(directory,reportName),'utf8')).replace(/^\uFEFF/,''))
  assert.equal(report.sourceCommit,cfg.source);assert.equal(report.runUrl,source.runUrl);assert.equal(report.installationAndStartup,'passed');assert.equal(report.sha256,sha256)
  const expectedMap=path.join(root,`${ext}.expected.blockmap`)
  await buildBlockMap(file,'gzip',expectedMap)
  assert.deepEqual(JSON.parse(gunzipSync(await readFile(file+'.blockmap'))),JSON.parse(gunzipSync(await readFile(expectedMap))),'Blockmap differs from final installer bytes')
  if(ext.endsWith('.dmg')) {
    assert.equal(localMac.sha256,sha256);assert.equal(localMac.sha512,sha512);assert.equal(localMac.size,bytes.length)
    assert.equal(report.version,version);assert.equal(report.architecture,'arm64');assert.equal(report.teamId,'2DMND6RL8D')
    for(const key of ['developerIdSignature','appNotarization','dmgNotarization','gatekeeper'])assert.equal(report[key],'passed')
    const notary=JSON.parse(await readFile(path.join(directory,'verification-notary-mac-arm64.json')));assert.equal(notary.status,'Accepted')
    await verifyMacUpdateMetadata(file,version)
    await verifyTrustedMacArtifact(file,{teamId:'2DMND6RL8D',kind:'dmg'})
    execFileSync(process.execPath,['release/dev3-tools/check-client.mjs',path.join(directory,`scrcpy-plus-cli-${version}.tgz`),version],{stdio:'inherit'})
    await stage(path.join(directory,'verification-notary-mac-arm64.json'))
    await stage(path.join(directory,`scrcpy-plus-cli-${version}.tgz`))
  } else assert.equal(report.authenticodeStatus,'NotSigned')
  await stage(file,safe);await stage(file+'.blockmap',safe+'.blockmap');await stage(path.join(directory,metadata));await stage(path.join(directory,reportName))
}
assert.equal(records.length,10)
const validation={version,tag:`v${version}`,repository:'MonsterXia/scrcpy-plus',operationsCommit:cfg.operationsCommit,sourceCommit:cfg.source,runUrl:source.runUrl,artifacts:source.artifacts,validatedAt:new Date().toISOString(),files:records,localMacVerification:localMac,checks:{sourceAndBuildJobs:'passed',installerHashes:'passed',updateMetadata:'passed',blockmaps:'passed',macSigningAndNotarization:'passed',installedStartup:'passed-in-CI',cliPackage:'passed'},boundaries:['Windows remains unsigned','No new physical-device or older-macOS compatibility matrix','No daily installation replacement']}
await writeFile(path.join(out,'release-validation.json'),JSON.stringify(validation,null,2)+'\n')
const validationBytes=await readFile(path.join(out,'release-validation.json'))
const manifest=[...records,{name:'release-validation.json',size:validationBytes.length,sha256:createHash('sha256').update(validationBytes).digest('hex')}]
await writeFile(path.join(out,'SHA256SUMS.txt'),manifest.map(f=>`${f.sha256}  ${f.name}`).sort().join('\n')+'\n')
const checksums=await readFile(path.join(out,'SHA256SUMS.txt'))
manifest.push({name:'SHA256SUMS.txt',size:checksums.length,sha256:createHash('sha256').update(checksums).digest('hex')})
assert.equal((await readdir(out)).length,12)
await writeFile(path.join(root,'publication-manifest.json'),JSON.stringify({...validation,files:manifest},null,2)+'\n')
console.log('Verified and staged 12 release files')
