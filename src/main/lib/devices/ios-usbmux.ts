import net from 'node:net'
import { build, parse } from 'plist'
import * as bplist from 'bplist-parser'
import type { ITarget } from 'common/types'

const MAX_PACKET = 1024 * 1024
export function muxPacket(value: Record<string, unknown>, tag = 1) {
  const body = Buffer.from(build(value as any))
  const header = Buffer.alloc(16)
  header.writeUInt32LE(body.length + 16, 0); header.writeUInt32LE(1, 4)
  header.writeUInt32LE(8, 8); header.writeUInt32LE(tag, 12)
  return Buffer.concat([header, body])
}
export function decodePlist(data: Buffer): any {
  if (data.subarray(0, 8).toString() === 'bplist00') return bplist.parseBuffer(data)[0]
  return parse(data.toString('utf8'))
}
function socket() {
  return process.platform === 'win32' ? net.createConnection({ host: '127.0.0.1', port: 27015 }) : net.createConnection('/var/run/usbmuxd')
}
// One framed response per operation; returned Connect sockets switch to raw
// lockdown framing only after the usbmux result is fully consumed.
function response(stream: net.Socket, packet: Buffer, mux: boolean, signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0)
    const cleanup = () => {
      clearTimeout(timer); stream.removeListener('data', data)
      stream.removeListener('error', fail); stream.removeListener('end', ended)
      signal?.removeEventListener('abort', aborted)
    }
    const fail = (error: Error) => { cleanup(); stream.destroy(); reject(error) }
    const ended = () => fail(new Error('Apple device connection closed'))
    const aborted = () => fail(new Error('Apple device request cancelled'))
    const timer = setTimeout(() => fail(new Error('Apple device query timed out')), 2500)
    const data = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      if (buffered.length < (mux ? 16 : 4)) return
      const length = mux ? buffered.readUInt32LE(0) : buffered.readUInt32BE(0) + 4
      if (length < (mux ? 16 : 4) || length > MAX_PACKET) return fail(new Error('Invalid Apple device packet length'))
      if (mux && (buffered.readUInt32LE(4) !== 1 || buffered.readUInt32LE(8) !== 8 || buffered.readUInt32LE(12) !== 1))
        return fail(new Error('Invalid usbmux response header'))
      if (buffered.length < length) return
      stream.pause()
      cleanup()
      if (buffered.length > length) stream.unshift(buffered.subarray(length))
      resolve(buffered.subarray(mux ? 16 : 4, length))
    }
    stream.on('data', data); stream.once('error', fail); stream.once('end', ended)
    signal?.addEventListener('abort', aborted, { once: true })
    if (signal?.aborted) { aborted(); return }
    stream.resume()
    stream.write(packet)
  })
}
async function queryMux(request: Record<string, unknown>, keep = false, signal?: AbortSignal) {
  const stream = socket()
  // Guard errors while handing the connected stream between framed queries.
  stream.on('error', () => {})
  try {
    const bytes = await response(stream, muxPacket({ ClientVersionString: 'scrcpy-plus',
      ProgName: 'scrcpy-plus', kLibUSBMuxVersion: 3, ...request }), true, signal)
    const value = decodePlist(bytes)
    if (keep) return { stream, value }
    stream.destroy(); return { stream, value }
  } catch (error) { stream.destroy(); throw error }
}
// Resolve the serial on every connection: usbmux device IDs change on reconnect.
// The returned socket is paused, with post-handshake bytes preserved for its owner.
export async function connectIos(udid: string, port: number, signal?: AbortSignal): Promise<net.Socket> {
  if (!/^[a-fA-F0-9-]{8,64}$/.test(udid) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid iOS USB endpoint')
  signal?.throwIfAborted()
  const devices = muxDevices((await queryMux({ MessageType: 'ListDevices' }, false, signal)).value)
  const device = devices.find(item => item.serial === udid)
  if (!device) throw new Error('iOS USB device not found')
  const { stream, value } = await queryMux({ MessageType: 'Connect', DeviceID: device.id,
    PortNumber: ((port & 255) << 8) | (port >> 8) }, true, signal)
  if (value.Number !== 0 || signal?.aborted) { stream.destroy(); throw new Error('iOS USB connection refused or cancelled') }
  stream.setNoDelay(true)
  return stream
}
async function lockdownValue(stream: net.Socket, key: string, signal?: AbortSignal) {
  const body = Buffer.from(build({ Label: 'scrcpy-plus', Request: 'GetValue', Key: key }))
  const prefix = Buffer.alloc(4); prefix.writeUInt32BE(body.length)
  const reply = decodePlist(await response(stream, Buffer.concat([prefix, body]), false, signal))
  return typeof reply.Value === 'string' && reply.Value ? reply.Value.slice(0, 256) : undefined
}
export async function getIosOverview(target: ITarget): Promise<Record<string, string>> {
  if (target.platform !== 'ios' || target.transport !== 'usb' || !target.connectionId || target.key !== `ios:${target.connectionId}`) throw new Error('Invalid iOS overview target')
  const signal = AbortSignal.timeout(8000)
  const stream = await connectIos(target.connectionId, 62078, signal)
  try {
    // Read only the fields shown in Overview, without creating a WDA session or
    // requesting the device's complete property dictionary.
    const result: Record<string, string> = { brand: 'Apple', udid: target.connectionId }
    const fields = { DeviceName: 'name', ProductVersion: 'osVersion', BuildVersion: 'buildVersion',
      ProductType: 'model', HardwareModel: 'hardwareModel', CPUArchitecture: 'abi', SerialNumber: 'serialNum', DeviceClass: 'deviceClass', ModelNumber: 'modelNumber' }
    for (const [key, field] of Object.entries(fields)) {
      const value = await lockdownValue(stream, key, signal)
      if (value) result[field] = value
    }
    if (!result.name && !result.osVersion && !result.model) throw new Error('iOS metadata unavailable; unlock and trust the computer')
    result.name ||= target.name
    if (result.osVersion) result.osVersion = `${result.deviceClass === 'iPad' ? 'iPadOS' : 'iOS'} ${result.osVersion}`
    return result
  } finally { stream.destroy() }
}
async function deviceName(id: number) {
  const { stream, value } = await queryMux({ MessageType: 'Connect', DeviceID: id, PortNumber: 32498 }, true) // htons(62078)
  try {
    if (value.Number !== 0) throw new Error('Apple device unavailable')
    const name = await lockdownValue(stream, 'DeviceName')
    if (!name) throw new Error('Apple device requires trust')
    return name
  } finally { stream.destroy() }
}
export function muxDevices(value: any): Array<{ id: number; serial: string }> {
  if (!Array.isArray(value?.DeviceList)) throw new Error('Invalid usbmux device list')
  return value.DeviceList.flatMap((entry: any) => {
    if (entry.Properties?.ConnectionType && entry.Properties.ConnectionType !== 'USB') return []
    const serial = entry.Properties?.SerialNumber
    return Number.isSafeInteger(entry.DeviceID) && entry.DeviceID > 0 &&
      typeof serial === 'string' && /^[a-fA-F0-9-]{8,64}$/.test(serial)
      ? [{ id: entry.DeviceID, serial }] : []
  })
}
export async function discoverIos(): Promise<ITarget[]> {
  const devices = muxDevices((await queryMux({ MessageType: 'ListDevices' })).value)
  return Promise.all(devices.map(async device => {
    let name = device.serial, state: ITarget['state'] = 'unauthorized'
    try { name = await deviceName(device.id); state = 'ready' } catch { /* USB detection is useful before trust. */ }
    return { key: `ios:${device.serial}`, connectionId: device.serial, name,
      platform: 'ios' as const, transport: 'usb' as const, state, ohosVersion: '', sdkVersion: '' }
  }))
}
