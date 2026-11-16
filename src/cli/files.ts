import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AutomationFault, isRecord, MAX_IMAGE_BYTES, MAX_REQUEST_BYTES } from '../common/automation/protocol'
export async function writeScreenshot(value: unknown, output: string, overwrite: boolean) {
  if (!isRecord(value) || !isRecord(value.frame) || !(value.bytes instanceof Uint8Array) || !value.bytes.byteLength || value.bytes.byteLength > MAX_IMAGE_BYTES) throw new AutomationFault('INTERNAL', 'Invalid screenshot result')
  return writeOutput(value.bytes,value.frame,output,overwrite)
}
export async function writeArtifact(value: unknown, output: string, overwrite: boolean) {
  if (!isRecord(value) || !isRecord(value.artifact) || !(value.bytes instanceof Uint8Array) || value.bytes.byteLength > MAX_REQUEST_BYTES || value.artifact.byteLength !== value.bytes.byteLength) throw new AutomationFault('INTERNAL','Invalid artifact result')
  return writeOutput(value.bytes,value.artifact,output,overwrite)
}
async function writeOutput(bytes: Uint8Array, metadata: Record<string,unknown>, output: string, overwrite: boolean) {
  const destination = path.resolve(output), temporary = path.join(path.dirname(destination), `.scrcpy-${randomUUID()}.tmp`)
  try {
    const handle = await fs.open(temporary, 'wx', 0o600)
    try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
    if (overwrite) await fs.rename(temporary, destination)
    else await fs.link(temporary, destination)
    return { ...metadata, path: destination }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new AutomationFault('INVALID_ARGUMENT', 'Output already exists; choose another path or use --overwrite')
    if (error instanceof AutomationFault) throw error
    throw new AutomationFault('UNAVAILABLE', 'Could not write output artifact')
  } finally { await fs.unlink(temporary).catch(() => {}) }
}
export async function readText(source: AsyncIterable<Uint8Array | string>, context: { deadline: number; signal: AbortSignal }) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  let stopped = false
  const chunks: Buffer[] = []; let size = 0
  try {
    return await Promise.race([(async () => {
      for await (const chunk of source) {
        if (stopped) throw new AutomationFault('CANCELLED', 'Text input cancelled')
        const bytes = Buffer.from(chunk); size += bytes.length
        if (size > 65536) throw new AutomationFault('INVALID_ARGUMENT', 'Text input exceeds 64 KiB')
        chunks.push(bytes)
      }
      try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }
      catch { throw new AutomationFault('INVALID_ARGUMENT', 'Text input must be valid UTF-8') }
    })(), new Promise<never>((_resolve,reject) => {
      abort = () => reject(new AutomationFault('CANCELLED', 'Text input cancelled'))
      timer = setTimeout(() => reject(new AutomationFault('TIMEOUT', 'Text input timed out')), Math.max(1, context.deadline - Date.now()))
      context.signal.addEventListener('abort', abort, { once: true })
      if (context.signal.aborted) abort()
    })])
  } finally { stopped = true; clearTimeout(timer); if (abort) context.signal.removeEventListener('abort', abort) }
}
