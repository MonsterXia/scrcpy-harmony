import net from 'node:net'
import { Readable } from 'node:stream'
import { AdbServerClient } from '@yume-chan/adb'
import { MaybeConsumable } from '@yume-chan/stream-extra'

// Share an already-running local ADB server; never launch/kill it or reconnect
// its USB transport. Every socket below belongs exclusively to this client.
export class LocalAdbConnector implements AdbServerClient.ServerConnector {
  private sockets = new Set<net.Socket>()
  private stopped = false
  constructor(private port = 5037) {}
  async connect(options?: AdbServerClient.ServerConnectionOptions): Promise<AdbServerClient.ServerConnection> {
    if (this.stopped || options?.signal?.aborted) throw new Error('Local ADB connection closed')
    const socket = net.createConnection({ host: '127.0.0.1', port: this.port })
    this.sockets.add(socket)
    const abort = () => socket.destroy(new Error('Local ADB connection cancelled'))
    const closed = new Promise<undefined>(resolve => socket.once('close', () => {
      this.sockets.delete(socket); options?.signal?.removeEventListener('abort', abort); resolve(undefined)
    }))
    socket.on('error', () => {})
    options?.signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => socket.destroy(new Error('Local ADB connection timed out')), 3000)
    try {
      await new Promise<void>((resolve, reject) => {
        const ended = () => reject(new Error('Local ADB connection closed'))
        socket.once('close', ended); socket.once('error', reject)
        socket.once('connect', () => { socket.removeListener('close', ended); resolve() })
      })
    } catch (error) { socket.destroy(); throw error }
    finally { clearTimeout(timer) }
    if (options?.unref) socket.unref()
    socket.setNoDelay(true)
    return {
      readable: Readable.toWeb(socket, { strategy: { highWaterMark: 256 * 1024, size: chunk => chunk.byteLength } }) as AdbServerClient.ServerConnection['readable'],
      writable: new MaybeConsumable.WritableStream<Uint8Array>({
        write: chunk => new Promise<void>((resolve, reject) => socket.write(chunk, error => error ? reject(error) : resolve())),
        close: () => { socket.destroy() }, abort: () => { socket.destroy() },
      }),
      closed,
      close: async () => { socket.destroy(); await closed },
    }
  }
  async addReverseTunnel(): Promise<string> { throw new Error('Local ADB reverse tunnels are unsupported') }
  async removeReverseTunnel(): Promise<void> { throw new Error('Local ADB reverse tunnels are unsupported') }
  async clearReverseTunnels(): Promise<void> { /* No reverse tunnels owned by this connector. */ }
  close() { this.stopped = true; for (const socket of this.sockets) socket.destroy() }
}

export async function connectLocalAdb(serial: string, connector = new LocalAdbConnector()) {
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(serial)) { connector.close(); throw new Error('Invalid local ADB USB serial') }
  const client = new AdbServerClient(connector)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([(async () => {
      const matches = (await client.getDevices()).filter(device => device.serial === serial)
      if (matches.length !== 1 || matches[0].state !== 'device') throw new Error('Selected USB device is unavailable in local ADB')
      const adb = await client.createAdb({ transportId: matches[0].transportId })
      if (adb.serial !== serial) { await adb.close(); throw new Error('Local ADB device identity changed') }
      const close = adb.close.bind(adb)
      adb.close = async () => { connector.close(); await close() }
      return adb
    })(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { connector.close(); reject(new Error('Local ADB setup timed out')) }, 8000)
    })])
  } catch (error) { connector.close(); throw error }
  finally { clearTimeout(timer) }
}
