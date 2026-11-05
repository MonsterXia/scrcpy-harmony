import type { ITarget } from 'common/types'

export type StartMode = 'single' | 'android-harmony' | 'all'
export function mirrorDeviceKey(device: ITarget) { return device.platform === 'ios' ? 'ios:airplay-receiver' : device.key }
export function targetsForMode(devices: ITarget[], mode: StartMode, selectedKey?: string) {
  if (mode === 'single') {
    const selected = devices.find(device => device.key === selectedKey)
    return selected && selected.state !== 'offline' && selected.state !== 'unavailable' &&
      (selected.state !== 'unauthorized' || selected.platform === 'ios') ? [selected] : []
  }
  return devices.filter(device => (device.platform === 'android' || device.platform === 'harmony') && device.state === 'ready' ||
    mode === 'all' && device.transport === 'receiver')
}
