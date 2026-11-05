import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
export async function validatePlatformBackends(directory) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'platform-backends.json'), 'utf8'))
  if (manifest.android?.version !== '3.3.3' || manifest.airplay?.platform !== process.platform || manifest.airplay?.arch !== process.arch || manifest.airplay?.napi !== 8)
    throw new Error('Platform backend source version or architecture mismatch')
  for (const [name, file] of [['android', 'android/scrcpy-server'], ['airplay', 'airplay/plus_airplay.node']]) {
    const bytes = await fs.readFile(path.join(directory, file))
    if (bytes.length !== manifest[name].size || createHash('sha256').update(bytes).digest('hex') !== manifest[name].sha256)
      throw new Error(`Platform backend integrity failed: ${name}`)
  }
  return manifest
}
