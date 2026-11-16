import type { Adb } from '@yume-chan/adb'

// Only the short-lived shell is cancelled; the shared video transport stays alive.
async function read(adb: Adb, command: string): Promise<string> {
  const controller = new AbortController()
  let child: Awaited<ReturnType<Adb['subprocess']['noneProtocol']['spawn']>> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const operation = (async () => {
    child = await adb.subprocess.noneProtocol.spawn(command, controller.signal)
    void child.exited.catch(() => {})
    if (controller.signal.aborted) { await child.kill(); throw controller.signal.reason }
    const reader = child.output.getReader(), decoder = new TextDecoder()
    let size = 0, output = ''
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) return output + decoder.decode()
        size += chunk.value.byteLength
        if (size > 256 * 1024) throw new Error('Android overview output too large')
        output += decoder.decode(chunk.value, { stream: true })
      }
    } finally { reader.releaseLock() }
  })()
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('Android overview timed out')
        controller.abort(error); reject(error)
      }, 7500)
    })])
  } finally {
    clearTimeout(timer)
    await child?.kill()
  }
}

export async function readAndroidOverview(adb: Adb) {
  const properties: Record<string, string> = {}
  for (const line of (await read(adb, 'getprop')).split('\n')) {
    const match = line.match(/^\[([^\]]+)\]: \[(.*)\]\s*$/)
    if (match) properties[match[1]] = match[2]
  }
  const kernelVersion = (await read(adb, 'uname -r')).trim()
  const screen = await read(adb, 'wm size')
  const memory = await read(adb, 'cat /proc/meminfo')
  const version = properties['ro.build.version.release'], sdk = properties['ro.build.version.sdk']
  const memTotal = Number(memory.match(/^MemTotal:\s*(\d+)\s+kB/m)?.[1]) * 1024
  return {
    name: properties['ro.product.model'] || '', brand: properties['ro.product.brand'] || '',
    model: properties['ro.product.model'] || '', abi: properties['ro.product.cpu.abilist'] || properties['ro.product.cpu.abi'] || '',
    serialNum: properties['ro.serialno'] || '', kernelVersion,
    processor: properties['ro.soc.model'] || properties['ro.hardware'] || '',
    osVersion: version ? `Android ${version}${sdk ? ` (API ${sdk})` : ''}` : '',
    physicalResolution: screen.match(/Physical size:\s*(\d+x\d+)/)?.[1] || '',
    ...(Number.isFinite(memTotal) && memTotal > 0 ? { memTotal } : {}),
  }
}
