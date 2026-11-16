import * as fs from 'node:fs/promises'
import { constants, createWriteStream } from 'node:fs'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import { AutomationFault, checkContext } from '../../../common/automation/protocol'
import type { AutomationContext } from '../../../common/automation/protocol'
const MAX_HAP_BYTES = 512 * 1024 * 1024
export async function withInstallationSource<T>(source: string, context: AutomationContext, install: (staged: string) => Promise<T>) {
  checkContext(context)
  if (typeof source !== 'string' || !path.isAbsolute(source) || !/\.hap$/i.test(source)) throw new AutomationFault('INVALID_ARGUMENT','Installation requires an absolute .hap file path')
  let file: Awaited<ReturnType<typeof fs.open>>
  try { file = await fs.open(source,constants.O_RDONLY | (constants.O_NOFOLLOW || 0)) }
  catch { throw new AutomationFault('INVALID_ARGUMENT','Installation source is not a readable regular file') }
  let directory: string | undefined
  try {
    const stat=await file.stat()
    if (!stat.isFile() || stat.size < 4 || stat.size > MAX_HAP_BYTES) throw new AutomationFault('INVALID_ARGUMENT','HAP file must be a regular ZIP package from 4 bytes to 512 MiB')
    const header=Buffer.alloc(4);await file.read(header,0,4,0)
    if (!header.equals(Buffer.from([0x50,0x4b,3,4]))) throw new AutomationFault('INVALID_ARGUMENT','HAP file does not have a ZIP package header')
    checkContext(context)
    directory=await fs.mkdtemp(path.join(tmpdir(),'scrcpy-plus-install-'))
    const staged=path.join(directory,'package.hap')
    // Copy from the verified descriptor, capped at its checked length. The
    // original path is never interpolated into a shell or reused after check.
    await pipeline(file.createReadStream({start:0,end:stat.size-1,autoClose:false}),createWriteStream(staged,{flags:'wx',mode:0o600}),{signal:context.signal})
    checkContext(context)
    return await install(staged)
  } finally {
    await file.close()
    if (directory) await fs.rm(directory,{recursive:true,force:true})
  }
}
