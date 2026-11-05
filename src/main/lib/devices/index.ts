import { app } from 'electron'
import type { DeviceDiscovery, ITarget } from 'common/types'
import { handleEvent } from 'share/main/lib/util'
import { getTargets } from '../hdc'
import { discoverAndroid } from './android'
import { discoverIos } from './ios-usbmux'
import { nativeMirrors } from '../../window/nativeMirror'
import * as screencast from '../../window/screencast'

export const mirrorSessions = nativeMirrors
const airplayReceiver: ITarget = { key: 'ios:airplay-receiver', name: 'AirPlay', platform: 'ios', transport: 'receiver', state: 'waiting', ohosVersion: '', sdkVersion: '' }
let current = new Map<string, ITarget>()
let refreshing: Promise<DeviceDiscovery> | undefined
let harmonyRead: Promise<ITarget[]> | undefined

function harmonyTargets() {
  // A legacy HDC request may outlive the discovery deadline; do not duplicate it.
  if (!harmonyRead) harmonyRead = getTargets(true).finally(() => { harmonyRead = undefined })
  return new Promise<ITarget[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HDC discovery timed out')), 6500)
    harmonyRead!.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
export function getDevices(): Promise<DeviceDiscovery> {
  if (refreshing) return refreshing
  refreshing = discover().finally(() => { refreshing = undefined })
  return refreshing
}
async function discover(): Promise<DeviceDiscovery> {
  const providers = [
    { name: 'harmony', run: async () => (await harmonyTargets()).map(target => ({ ...target,
      platform: 'harmony' as const, connectionId: target.key, state: target.state || 'ready' as const })) },
    { name: 'android', run: discoverAndroid },
    { name: 'ios', run: discoverIos },
  ]
  const results = await Promise.allSettled(providers.map(provider => provider.run()))
  const targets: ITarget[] = [], errors: string[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      targets.push(...result.value)
      const online = new Set(result.value.filter(target => target.state !== 'offline').map(target => target.key))
      for (const session of [...screencast.listSessions(), ...mirrorSessions.list()]) {
        if (session.platform === providers[index].name && session.platform !== 'ios' && !online.has(session.deviceKey)) {
          if (session.platform === 'harmony') screencast.closeSession(session.id)
          else void mirrorSessions.stop(session.id).catch(() => console.error('Disconnected session cleanup unconfirmed'))
        }
      }
    }
    else errors.push(providers[index].name)
  })
  targets.push({ ...airplayReceiver })
  current = new Map(targets.map(target => [target.key, target]))
  return { targets, errors }
}
export async function startSelected(key: string) {
  if (typeof key !== 'string') throw new Error('Invalid device key')
  const target = current.get(key)
  if (!target) throw new Error('Refresh devices before starting')
  if (target.platform === 'harmony') {
    if (target.state !== 'ready') throw new Error('Device requires authorization')
    screencast.showWin(target)
  }
  else await mirrorSessions.start(target)
}
export function init() {
  handleEvent('getDevices', getDevices)
  handleEvent('getMirrorSessions', () => [...screencast.listSessions(), ...mirrorSessions.list()])
  handleEvent('stopMirrorSession', async (id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid session')
    if (!screencast.closeSession(id)) await mirrorSessions.stop(id)
  })
  let cleaned = false, stopping = false
  app.on('before-quit', event => {
    if (cleaned) return
    event.preventDefault()
    if (stopping) return
    stopping = true
    void mirrorSessions.dispose().catch(() => console.error('Mirror backend cleanup unconfirmed'))
      .finally(() => { cleaned = true; app.quit() })
  })
}
