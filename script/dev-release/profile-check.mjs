import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
export async function snapshotProfile(profile) {
  const result={}
  for(const name of ['settings.json','main.json']) {
    const bytes=await readFile(path.join(profile,'data',name))
    result[name]=createHash('sha256').update(bytes).digest('hex')
  }
  return result
}
export function assertProfilePreserved(before,after) {
  assert.deepEqual(Object.keys(before).sort(),['main.json','settings.json'])
  assert.deepEqual(after,before,'Installer changed existing Plus settings/main store')
}
