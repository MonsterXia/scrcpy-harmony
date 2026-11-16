import { AutomationFault, isRecord, MAX_IMAGE_BYTES, MAX_REQUEST_BYTES } from './protocol'
import type { AutomationResult } from './protocol'
export const BLOB_CONTENT_TYPE = 'application/vnd.scrcpy-plus.blob'
export const FRAME_CONTENT_TYPE = 'application/vnd.scrcpy-plus.frame'
export const MAX_WIRE_BYTES = MAX_IMAGE_BYTES + MAX_REQUEST_BYTES + 4
export function encodeResult(result: AutomationResult): { type: string; body: Buffer } {
  if (result.ok && isRecord(result.data) && result.data.bytes instanceof Uint8Array) {
    const { bytes, ...data } = result.data
    const frame = isRecord(data.frame)
    const maximum = frame ? MAX_IMAGE_BYTES : MAX_REQUEST_BYTES
    const envelope = Buffer.from(JSON.stringify({ ...result, data }))
    if (bytes.byteLength > maximum || envelope.length > MAX_REQUEST_BYTES || (frame ? !bytes.byteLength : !isRecord(data.artifact) || data.artifact.byteLength !== bytes.byteLength)) throw new AutomationFault('INTERNAL', 'Invalid binary result')
    const length = Buffer.alloc(4); length.writeUInt32BE(envelope.length)
    return { type: frame ? FRAME_CONTENT_TYPE : BLOB_CONTENT_TYPE, body: Buffer.concat([length, envelope, bytes]) }
  }
  const body = Buffer.from(JSON.stringify(result))
  if (body.length > MAX_REQUEST_BYTES) throw new AutomationFault('INTERNAL', 'Response exceeds 1 MiB')
  return { type: 'application/json; charset=utf-8', body }
}
export function decodeResult(bytes: Buffer, type: string): unknown {
  if (type.split(';')[0] === 'application/json') {
    if (bytes.length > MAX_REQUEST_BYTES) throw new AutomationFault('INTERNAL', 'Response exceeds 1 MiB')
    return JSON.parse(bytes.toString('utf8'))
  }
  if ((type !== FRAME_CONTENT_TYPE && type !== BLOB_CONTENT_TYPE) || bytes.length < 4) throw new AutomationFault('INTERNAL', 'Invalid response encoding')
  const size = bytes.readUInt32BE(0)
  if (size < 1 || size > MAX_REQUEST_BYTES || size + 4 > bytes.length || (type === FRAME_CONTENT_TYPE && size + 4 === bytes.length) || bytes.length - size - 4 > (type === FRAME_CONTENT_TYPE ? MAX_IMAGE_BYTES : MAX_REQUEST_BYTES)) throw new AutomationFault('INTERNAL', 'Invalid binary response length')
  const result = JSON.parse(bytes.subarray(4, size + 4).toString('utf8'))
  if (!isRecord(result) || result.ok !== true || !isRecord(result.data) || !(type === FRAME_CONTENT_TYPE ? isRecord(result.data.frame) : isRecord(result.data.artifact) && result.data.artifact.byteLength === bytes.length-size-4) || Object.hasOwn(result.data, 'bytes')) throw new AutomationFault('INTERNAL', 'Invalid binary response envelope')
  result.data.bytes = bytes.subarray(size + 4)
  return result
}
