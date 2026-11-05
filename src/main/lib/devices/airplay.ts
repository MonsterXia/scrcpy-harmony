import { Worker } from 'node:worker_threads'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getUserDataPath, resolveResources } from 'share/main/lib/util'
import type { NativeFrame } from './media'
import { airplayWorkerSource } from './airplay-worker'

export class AirplayMirror {
  private worker?: Worker
  private closed = false
  private exited?: Promise<number>
  private closing?: Promise<void>
  async start(frame: (frame: NativeFrame) => void, state: (state: string) => void) {
    const directory = getUserDataPath('data/airplay')
    await fs.mkdir(directory, { recursive: true })
    const identityFile = path.join(directory, 'identity')
    try {
      const bytes = randomBytes(6); bytes[0] = (bytes[0] | 2) & 0xfe
      await fs.writeFile(identityFile, [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(':'), { mode: 0o600, flag: 'wx' })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    const identity = (await fs.readFile(identityFile, 'utf8')).trim()
    if (this.closed) throw new Error('AirPlay session closed')
    const worker = new Worker(airplayWorkerSource, { eval: true, workerData: {
      modulePath: resolveResources('airplay/plus_airplay.node'), identity, keyFile: path.join(directory, 'pairing.key'),
    } })
    this.worker = worker
    this.exited = new Promise(resolve => worker.once('exit', resolve))
    await new Promise<void>((resolve, reject) => {
      let ready = false
      const timer = setTimeout(() => { reject(new Error('AirPlay worker startup timed out')); void this.close().catch(() => {}) }, 10000)
      worker.on('error', () => { clearTimeout(timer); if (!ready) reject(new Error('AirPlay native worker failed')); else if (!this.closed) state('error') })
      worker.once('exit', () => { clearTimeout(timer); if (!ready) reject(new Error('AirPlay worker closed')); else if (!this.closed) state('disconnected') })
      worker.on('message', event => {
        if (event.type === 'ready') {
          clearTimeout(timer); ready = true
          if (this.closed) { worker.postMessage({ type: 'stop' }); reject(new Error('AirPlay session closed')); return }
          state('waiting'); resolve(); return
        }
        if (event.type === 'error') {
          clearTimeout(timer); if (!ready) reject(new Error(event.message)); else if (!this.closed) state('error')
          return
        }
        if (event.type === 'video') {
          try { if (!this.closed) frame({ data: event.data, timestamp: event.timestamp, reset: event.reset }) }
          finally { worker.postMessage({ type: 'ack', sequence: event.sequence }) }
        } else if (!this.closed && event.type === 'connected') state('connected')
        else if (!this.closed && (event.type === 'disconnected' || event.type === 'reset')) {
          frame({ data: new Uint8Array(), timestamp: 0, reset: true }); state('waiting')
        }
      })
    })
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    const worker = this.worker
    if (!worker) return Promise.resolve()
    this.closing = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        worker.postMessage({ type: 'stop' })
        await Promise.race([this.exited, new Promise<void>((_, reject) => {
          timer = setTimeout(() => reject(new Error('AirPlay worker stop timed out')), 5000)
        })])
      } finally {
        clearTimeout(timer)
        // Termination also runs the addon's destructor if the worker failed.
        try { await worker.terminate() }
        finally { this.worker = undefined; this.closing = undefined }
      }
    })()
    return this.closing
  }
}
