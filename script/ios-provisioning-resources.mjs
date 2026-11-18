import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
export async function validateIosProvisioning(directory) {
 const root=await fs.realpath(directory), manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'))
 if(manifest.version!==1 || manifest.platform!==process.platform || manifest.arch!==process.arch || !Array.isArray(manifest.files) || manifest.files.length>20000)throw Error('iOS helper platform mismatch')
 for(const entry of manifest.files) {
  if(typeof entry.file!=='string'||path.isAbsolute(entry.file)||entry.file.split(/[\\/]/).includes('..'))throw Error('Invalid iOS helper manifest')
  const file=path.join(directory,entry.file)
  if(!(await fs.realpath(file)).startsWith(root+path.sep)||createHash('sha256').update(await fs.readFile(file)).digest('hex')!==entry.sha256)throw Error('iOS helper integrity failed')
 }
 const ext=process.platform==='win32'?'.exe':''
 for(const name of ['ios-sign'+ext,'device/ios-device'+ext,'WDA.ipa','THIRD_PARTY_NOTICES.txt'])if(!manifest.files.some(entry=>entry.file===name))throw Error('iOS helper resources incomplete')
 return manifest
}
