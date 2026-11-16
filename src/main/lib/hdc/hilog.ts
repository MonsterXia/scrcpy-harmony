import type { DeviceOperationContext } from '../../../common/automation/deviceContext'
import Emitter from 'licia/Emitter'
import types from 'licia/types'
import { Client } from 'hdckit'
import { getTargetStore, getPidNames, setTargetStore } from './base'
import uniqId from 'licia/uniqId'
import * as window from 'share/main/lib/window'
import { handleEvent } from 'share/main/lib/util'
import { IpcOpenHilog } from 'common/types'
import log from 'share/common/log'

let client: Client
const logger = log('hilog')

class Hilog extends Emitter {
  private reader: any
  private paused = false
  private closed = false
  private generation = 0
  private onEntry?: (entry: any) => Promise<void>
  constructor(reader: any) {
    super()

    this.reader = reader
  }
  async init(connectKey: string) {
    const { reader } = this

    this.onEntry = async (entry) => {
      if (this.paused || this.closed) {
        return
      }
      const generation = this.generation
      const isCurrent = () =>
        !this.closed && !this.paused && generation === this.generation
      entry.bundleName = `pid-${entry.pid}`
      try {
        if (entry.pid != 0) {
          let pidNames = getTargetStore(connectKey, 'pidNames')
          if (!pidNames || !pidNames[entry.pid]) {
            pidNames = await getPidNames(connectKey)
            if (!isCurrent()) return
            setTargetStore(connectKey, 'pidNames', pidNames)
          }
          entry.bundleName = pidNames[entry.pid] || `pid-${entry.pid}`
        }
      } catch (error) {
        if (!isCurrent()) return
        // PID enrichment must not discard the log or reject an async listener.
        logger.warn('Failed to resolve HiLog PID name', error)
      }
      if (isCurrent()) this.emit('entry', entry)
    }
    reader.on('entry', this.onEntry)
  }
  close() {
    if (this.closed) return
    this.closed = true
    this.generation++
    if (this.onEntry) this.reader.off('entry', this.onEntry)
    this.reader.end()
  }
  pause() {
    if (this.closed || this.paused) return
    this.paused = true
    // Resuming must not revive work started before this pause.
    this.generation++
  }
  resume() {
    if (this.closed) return
    this.paused = false
  }
}

const hilogs: types.PlainObj<Hilog> = {}

const openHilog: IpcOpenHilog = async function (connectKey) {
  const device = await client.getTarget(connectKey)
  const reader = await device.openHilog({ clear: true })
  const hilog = new Hilog(reader)
  await hilog.init(connectKey)
  const hilogId = uniqId('hilog')
  hilog.on('entry', (entry) => {
    window.sendTo('main', 'hilogEntry', hilogId, entry)
  })
  hilogs[hilogId] = hilog

  return hilogId
}

const pauseHilog = async function (hilogId: string) {
  hilogs[hilogId]?.pause()
}

const resumeHilog = async function (hilogId: string) {
  hilogs[hilogId]?.resume()
}

const closeHilog = async function (hilogId: string) {
  const hilog = hilogs[hilogId]
  delete hilogs[hilogId]
  hilog?.close()
}

// Finite capture has its own reader and never clears or pauses GUI logs.
export async function captureHilog(key: string,durationMs: number,maxBytes: number,context: DeviceOperationContext) {
  if (context.deviceKey !== key || !context.captureHost) throw new Error('Device context mismatch')
  const result=await context.captureHost(['shell','hilog','-v','wrap','-v','epoch'],durationMs,maxBytes)
  if (/^\s*(?:\[Fail\]|\[E\d{6}\]|error:)/im.test(Buffer.from(result.bytes).toString('utf8'))) throw new Error('Device log capture failed')
  return result
}

export function init(c: Client) {
  client = c

  handleEvent('openHilog', openHilog)
  handleEvent('closeHilog', closeHilog)
  handleEvent('pauseHilog', pauseHilog)
  handleEvent('resumeHilog', resumeHilog)
}
