import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const root=process.cwd(), cache=path.join(root,'build/ios-provisioning'), output=path.join(root,'resources/ios-provisioning')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
function run(file,args) { const result=spawnSync(file,args,{stdio:'inherit',env:process.env}); if(result.status!==0) throw Error(`${path.basename(file)} failed`) }
async function exists(file){return !!(await fs.stat(file).catch(()=>null))}
async function files(dir,prefix='') {
 const result=[]
 for(const item of await fs.readdir(dir,{withFileTypes:true})) {
  const relative=prefix+item.name, full=path.join(dir,item.name)
  if(item.isDirectory()) result.push(...await files(full,relative+'/'))
  // Python.framework includes Versions/Current -> 3.x directory aliases.
  // Preserve these links in the bundle; hash files at their canonical paths
  // without trying to read a directory or recursing through alias cycles.
  else if(item.isSymbolicLink() && (await fs.stat(full)).isDirectory()) continue
  else result.push(relative)
 }
 return result
}
await fs.mkdir(cache,{recursive:true}); await fs.mkdir(output,{recursive:true})
// A macOS CI job supplies this unsigned IPA to the Windows build from the same commit.
const python=process.env.IOS_PYTHON || 'python3'
const ipa=path.join(cache,'WDA.ipa')
if(process.env.IOS_WDA_IPA) {
 run(python,['native/ios-device/validate_ipa.py',process.env.IOS_WDA_IPA])
 await fs.copyFile(process.env.IOS_WDA_IPA,ipa)
} else {
 const app=process.env.IOS_WDA_APP || path.join(root,'build/ios-wda/unsigned/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app')
 // Xcode performs incremental compilation. An existing app alone does not
 // establish that it was built from the current source and ownership patches.
 if(!process.env.IOS_WDA_APP) {
  if(process.platform!=='darwin') throw Error('Supply IOS_WDA_IPA from the macOS unsigned-WDA build')
  run(process.execPath,['script/ios-wda.mjs','build','--unsigned',...(process.env.DEVELOPER_DIR?['--xcode',process.env.DEVELOPER_DIR]:[])])
 }
 run(python,['native/ios-device/package_wda.py',app,ipa])
}
const sources=['native/ios-sign/Cargo.toml','native/ios-sign/Cargo.lock','native/ios-sign/src/main.rs','native/ios-device/device.py','native/ios-device/requirements.lock','native/ios-device/package_wda.py','native/ios-device/validate_ipa.py','native/ios-device/notices.py','script/build-ios-provisioning.mjs','script/ios-wda.mjs','vendor/ios-wda/manifest.json','vendor/ios-wda/session-ownership.patch']
const stamp=hash(Buffer.concat([Buffer.from(process.platform+process.arch),...await Promise.all(sources.map(f=>fs.readFile(f))),await fs.readFile(ipa)]))
const old=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8').catch(()=> '{}'))
if(old.stamp===stamp) {
 let valid=true
 for(const f of old.files || []) { if(hash(await fs.readFile(path.join(output,f.file)).catch(()=>Buffer.alloc(0)))!==f.sha256)valid=false }
 if(valid){console.log('iOS provisioning resources already current');process.exit(0)}
}
run('cargo',['build','--release','--locked','--manifest-path','native/ios-sign/Cargo.toml'])
const venv=path.join(cache,'venv'), vpy=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python')
if(!await exists(vpy))run(python,['-m','venv',venv])
run(vpy,['-m','pip','install','--disable-pip-version-check','-r','native/ios-device/requirements.lock'])
run(vpy,['-m','PyInstaller','--noconfirm','--clean','--onedir','--name','ios-device','--distpath',path.join(cache,'frozen'),'--workpath',path.join(cache,'pyinstaller'),'--specpath',cache,'--collect-all','pymobiledevice3','--collect-all','developer_disk_image','--collect-all','certifi','--recursive-copy-metadata','pymobiledevice3','native/ios-device/device.py'])
await fs.rm(output,{recursive:true,force:true}); await fs.mkdir(output,{recursive:true})
await fs.cp(path.join(cache,'frozen/ios-device'),path.join(output,'device'),{recursive:true,verbatimSymlinks:true})
await fs.copyFile(path.join(root,'native/ios-sign/target/release/scrcpy-plus-ios-sign'+(process.platform==='win32'?'.exe':'')),path.join(output,'ios-sign'+(process.platform==='win32'?'.exe':'')))
await fs.copyFile(ipa,path.join(output,'WDA.ipa'))
run(vpy,['native/ios-device/notices.py',path.join(output,'THIRD_PARTY_NOTICES.txt')])
const metadata=spawnSync('cargo',['metadata','--locked','--format-version','1','--manifest-path','native/ios-sign/Cargo.toml'],{encoding:'utf8',maxBuffer:16*1024*1024})
if(metadata.status!==0)throw Error('Cannot collect Rust dependency licenses')
let notices='\nRust signing component dependencies\n'
for(const pkg of JSON.parse(metadata.stdout).packages) {
 notices+=`\n${pkg.name} ${pkg.version} — ${pkg.license || 'see included license'}\n${pkg.repository || ''}\n`
 const dir=path.dirname(pkg.manifest_path)
 for(const f of await fs.readdir(dir))if(/^(LICENSE|COPYING|NOTICE)/i.test(f)&&(await fs.stat(path.join(dir,f))).isFile())notices+=(await fs.readFile(path.join(dir,f),'utf8'))+'\n'
}
notices+='\nWDA\n'+await fs.readFile('vendor/ios-wda/LICENSE','utf8')
await fs.appendFile(path.join(output,'THIRD_PARTY_NOTICES.txt'),notices)
const entries=[]
for(const file of await files(output)) entries.push({file,sha256:hash(await fs.readFile(path.join(output,file)))})
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({version:1,platform:process.platform,arch:process.arch,stamp,wdaCommit:JSON.parse(await fs.readFile('vendor/ios-wda/manifest.json','utf8')).commit,files:entries},null,2)+'\n')
console.log('Built self-contained iOS signing and device helpers')
