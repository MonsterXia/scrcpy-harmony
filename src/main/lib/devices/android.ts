import { Adb, AdbDaemonTransport } from '@yume-chan/adb'
import type { AdbCredentialStore, AdbPrivateKey } from '@yume-chan/adb'
import { AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb'
import type { AdbDaemonWebUsbDevice } from '@yume-chan/adb-daemon-webusb'
import type { AndroidKeyCode } from '@yume-chan/scrcpy'
import { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy'
import { ReadableStream, WritableStream } from '@yume-chan/stream-extra'
import { createRequire } from 'node:module'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, link, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { ITarget, NativeMirrorInput } from 'common/types'
import { getUserDataPath, resolveResources } from 'share/main/lib/util'
import type { NativeFrame } from './media'

export class FileAdbCredentials implements AdbCredentialStore {
  constructor(private file: string) {}
  async *iterateKeys(): AsyncGenerator<AdbPrivateKey> {
    try { yield { buffer: await readFile(this.file), name: 'Scrcpy Plus' } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  async generateKey(): Promise<AdbPrivateKey> {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048, publicExponent: 65537,
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
      publicKeyEncoding: { type: 'spki', format: 'der' },
    })
    await mkdir(path.dirname(this.file), { recursive: true })
    // Publish only a complete key. An exclusive final-path write exposes an
    // empty/partial file to a second device authorizing at the same time.
    const temporary = `${this.file}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, privateKey, { mode: 0o600, flag: 'wx' })
      try { await link(temporary, this.file) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    } finally { await unlink(temporary).catch(() => {}) }
    return { buffer: await readFile(this.file), name: 'Scrcpy Plus' }
  }
}
let manager: AdbDaemonWebUsbDeviceManager | undefined
const configuredUsb = new WeakSet<USBDevice>()
function usbDisconnected(error: unknown) {
  return error instanceof Error && /device disconnected|\bdisconnected\b|no such device|device.*not found|LIBUSB.*NO_DEVICE/i.test(error.message)
}
export function configureAndroidUsb(raw: USBDevice) {
  if (configuredUsb.has(raw)) return
  configuredUsb.add(raw)
  // Poll bulk reads through RSA/idle periods. A finite native deadline lets
  // shutdown drain I/O even if the disconnected endpoint cannot clear its halt.
  const transferIn = raw.transferIn.bind(raw) as (endpoint: number, length: number, timeout: number) => Promise<USBInTransferResult>
  const transferOut = raw.transferOut.bind(raw)
  const close = raw.close.bind(raw), open = raw.open.bind(raw)
  const claim = raw.claimInterface.bind(raw), release = raw.releaseInterface.bind(raw)
  const claimed = new Set<number>()
  const pending = new Set<Promise<unknown>>()
  const endpointDevice = raw as USBDevice & { getEndpoint?: (address: number) => { timeout: number } }
  function prepareEndpoint(number: number, input: boolean) {
    // libusb WebUSB uses endpoint timeouts rather than a third transfer arg.
    if (endpointDevice.getEndpoint) endpointDevice.getEndpoint(number | (input ? 0x80 : 0)).timeout = 1000
  }
  let closed = false, closing: Promise<void> | undefined
  async function track<T>(operation: () => Promise<T>) {
    if (closed) throw new Error('Android USB connection closed')
    const promise = operation(); pending.add(promise)
    try { return await promise } finally { pending.delete(promise) }
  }
  raw.transferIn = async (endpoint, length) => {
    while (!closed) {
      try { return await track(() => { prepareEndpoint(endpoint, true); return transferIn(endpoint, length, 1000) }) }
      catch (error) {
        if (closed || !(error instanceof Error) || !/Cancelled|timed?[\s_]*out/i.test(error.message)) throw error
      }
    }
    throw new Error('Android USB connection closed')
  }
  raw.transferOut = (endpoint, data) => track(() => { prepareEndpoint(endpoint, false); return transferOut(endpoint, data) })
  raw.claimInterface = async number => { await claim(number); claimed.add(number) }
  raw.releaseInterface = async number => { await release(number); claimed.delete(number) }
  raw.open = async () => { await closing; await open(); closed = false; closing = undefined }
  raw.close = () => {
    if (closing) return closing
    closed = true
    closing = (async () => {
      await Promise.allSettled([...pending])
      let failure: unknown
      // Reading configuration here invokes native string-descriptor getters.
      // A detached device cannot answer them, so release only interfaces that
      // this connection successfully claimed, and always close the handle.
      for (const number of claimed) {
        try { await release(number); claimed.delete(number) }
        catch (error) {
          if (usbDisconnected(error)) claimed.delete(number)
          else failure ||= error
        }
      }
      try { await close() } catch (error) { if (!usbDisconnected(error)) failure ||= error }
      if (failure) throw failure
    })().catch(error => { closing = undefined; throw error })
    return closing
  }
}
async function deviceManager() {
  // Direct USB transport, with no adb server or adb executable.
  if (!manager) {
    const { WebUSB } = createRequire(__filename)('usb')
    manager ||= new AdbDaemonWebUsbDeviceManager(new WebUSB({ allowAllDevices: true, deviceTimeout: 5000 }))
  }
  return manager
}
let enumeration: Promise<AdbDaemonWebUsbDevice[]> | undefined
function usbIdentity(device: AdbDaemonWebUsbDevice) {
  const raw = device.raw as { serialNumber?: string | null; bus?: string; address?: number; ports?: number[];
    device?: { busNumber: number; deviceAddress: number; portNumbers?: number[] } }
  const bus = raw.bus || raw.device?.busNumber?.toString()
  const ports = raw.ports || raw.device?.portNumbers
  const address = raw.address ?? raw.device?.deviceAddress
  if (!raw.serialNumber && bus && (ports?.length || address !== undefined)) {
    return `usb:${device.serial}:${bus}:${ports?.join('.') || address}`
  }
  return device.serial
}
async function usbDevices() {
  if (!enumeration) enumeration = deviceManager().then(manager => manager.getDevices()).finally(() => { enumeration = undefined })
  // Enumeration owns no claimed interface. Retain a late native request instead
  // of starting another one after the display deadline.
  return deadline(enumeration, () => {}, 5000)
}
export async function discoverAndroid(): Promise<ITarget[]> {
  return (await usbDevices()).map(device => ({
    key: `android:${usbIdentity(device)}`, connectionId: usbIdentity(device), name: device.name || device.serial,
    platform: 'android', transport: 'usb', state: 'ready', ohosVersion: '', sdkVersion: '',
  }))
}

async function deadline<T>(promise: Promise<T>, cancel: () => void, milliseconds = 30000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { cancel(); reject(new Error('Android connection timed out')) }, milliseconds)
    })])
  } finally { clearTimeout(timer) }
}
export class AndroidMirror {
  private device?: AdbDaemonWebUsbDevice
  private adb?: Adb
  private client?: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>>
  private closed = false
  private closing?: Promise<void>
  private width = 0
  private height = 0
  private inputTail = Promise.resolve()
  private pendingInput = 0
  private touchGeneration = 0
  private releaseQueuedFor: number | undefined
  constructor(private target: ITarget) {}
  private check() { if (this.closed) throw new Error('Android session closed') }
  async start(frame: (frame: NativeFrame) => void, state: (state: string) => void) {
    try {
      this.device = (await usbDevices()).find(device => usbIdentity(device) === this.target.connectionId)
      if (!this.device) throw new Error('Android device disconnected')
      configureAndroidUsb(this.device.raw)
      this.check(); state('authorizing')
      const connection = await deadline(this.device.connect().then(async connection => {
        if (this.closed) { await this.device?.raw.close(); this.check() }
        return connection
      }), () => { void this.device?.raw.close() })
      this.check()
      const transport = await deadline(AdbDaemonTransport.authenticate({
        serial: this.device.serial, connection,
        credentialStore: new FileAdbCredentials(getUserDataPath('data/android-adbkey.pk8')),
      }).then(async transport => {
        if (this.closed) { await transport.close(); this.check() }
        return transport
      }), () => { void this.device?.raw.close() })
      this.adb = new Adb(transport); this.check(); state('starting')
      const server = await readFile(resolveResources('android/scrcpy-server'))
      this.check()
      // Each device has its own ADB transport and server process/socket namespace.
      const serverPath = '/data/local/tmp/scrcpy-plus-server.jar'
      await deadline(AdbScrcpyClient.pushServer(this.adb, new ReadableStream({
        start(controller) { controller.enqueue(server); controller.close() },
      }), serverPath), () => { void this.adb?.close() })
      this.check()
      this.client = await deadline(AdbScrcpyClient.start(this.adb, serverPath,
        new AdbScrcpyOptions3_3_3({ video: true, audio: false, control: true,
          videoCodec: 'h264', maxSize: 1920, maxFps: 60, tunnelForward: true })).then(async client => {
        if (this.closed) { await client.close(); this.check() }
        return client
      }),
      () => { void this.adb?.close() })
      this.check()
      const client = this.client
      void client.output.pipeTo(new WritableStream({ write() {} })).catch(() => {})
      if (client.clipboard) void client.clipboard.pipeTo(new WritableStream({ write() {} })).catch(() => {})
      const video = await deadline(client.videoStream, () => { void this.adb?.close() }); this.check()
      state('connected')
      void (async () => {
        try {
          for await (const packet of video.stream) {
            if (this.closed) break
            this.width = video.width || video.metadata.width || 0
            this.height = video.height || video.metadata.height || 0
            frame({ data: packet.data, timestamp: packet.type === 'data' ? Number(packet.pts ?? 0n) : 0,
              config: packet.type === 'configuration', keyFrame: packet.type === 'data' && packet.keyframe === true })
          }
          if (!this.closed) state('disconnected')
        } catch { if (!this.closed) state('error') }
      })()
    } catch (error) { await this.close(); throw error }
  }
  input(message: NativeMirrorInput) {
    if (this.closed || !this.client?.controller) return Promise.reject(new Error('Android control unavailable'))
    if (this.pendingInput >= 64 && message.type === 'touch' && message.action === 'move') return Promise.resolve()
    const release = message.type === 'touch' && message.action === 'up'
    if (release && this.releaseQueuedFor === this.touchGeneration) return Promise.resolve()
    if (this.pendingInput >= 128 && !release) return Promise.reject(new Error('Android input queue full'))
    if (message.type === 'touch' && message.action === 'down') this.touchGeneration++
    const generation = this.touchGeneration
    if (release) this.releaseQueuedFor = generation
    this.pendingInput++
    const task = this.inputTail.catch(() => {}).then(async () => {
      this.check()
      const controller = this.client!.controller!
      if (message.type === 'text') {
        await controller.setClipboard({ sequence: 0n, paste: true, content: message.text })
      } else if (message.type === 'key') {
        await controller.injectKeyCode({ action: 0, keyCode: message.keyCode as AndroidKeyCode, repeat: 0, metaState: 0 })
        await controller.injectKeyCode({ action: 1, keyCode: message.keyCode as AndroidKeyCode, repeat: 0, metaState: 0 })
      } else {
        if (!this.width || !this.height) throw new Error('Android screen size unavailable')
        const point = { pointerX: Math.min(this.width - 1, Math.round(message.x * this.width)),
          pointerY: Math.min(this.height - 1, Math.round(message.y * this.height)), videoWidth: this.width, videoHeight: this.height }
        if (message.type === 'touch') await controller.injectTouch({ ...point,
          action: message.action === 'down' ? 0 : message.action === 'up' ? 1 : 2,
          pointerId: -2n, pressure: message.action === 'up' ? 0 : 1, actionButton: 0, buttons: 0 })
        else await controller.injectScroll({ ...point, scrollX: message.dx, scrollY: message.dy, buttons: 0 })
      }
    }).finally(() => { this.pendingInput--; if (release && this.releaseQueuedFor === generation) this.releaseQueuedFor = undefined })
    this.inputTail = task
    return task
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    this.closing = (async () => {
      // Kill the phone server while its ADB transport is still writable.
      // Concurrent native close calls can violate node-usb's borrow rules.
      await deadline(Promise.resolve().then(() => this.client?.close()), () => {}, 2000).catch(() => {})
      try { await this.adb?.close() }
      finally { await this.device?.raw.close() }
    })().catch(error => { this.closing = undefined; throw error })
    return this.closing
  }
}
