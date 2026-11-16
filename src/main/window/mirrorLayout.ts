import type { BrowserWindow, Rectangle } from 'electron'
import type { MirrorLayout, MirrorLayoutRequest } from 'common/types'
import type { MirrorSource } from './mergedMirrors'
import { closeMergedMirrors, showMergedMirrors, getMergedMirrorWindow } from './mergedMirrors'
import { arrangeMirrors } from './arrangeMirrors'

let arranged = ''
function geometry(provider: () => MirrorSource[]) {
  return JSON.stringify(provider().filter(source => !source.window.isDestroyed()).map(source => ({
    id: source.window.id, bounds: source.window.getBounds(),
  })).sort((a, b) => a.id - b.id))
}
export function getMirrorLayout(provider: () => MirrorSource[]): MirrorLayout {
  if (getMergedMirrorWindow()) return 'merged'
  return arranged && arranged === geometry(provider) ? 'side-by-side' : 'independent'
}
export function focusMirror(deviceKey: string, provider: () => MirrorSource[]) {
  if (typeof deviceKey !== 'string' || !deviceKey || deviceKey.length > 256) throw new Error('Invalid device key')
  const source = provider().find(source => source.deviceKey === deviceKey && !source.window.isDestroyed())
  if (!source) throw new Error('No active mirror')
  source.claimGui?.()
  const window = getMergedMirrorWindow(deviceKey) || source.window
  if (window.isMinimized()) window.restore()
  window.show(); window.focus()
}

export function applyMirrorLayout(request: MirrorLayoutRequest, provider: () => MirrorSource[], area: Rectangle) {
  if (!request || !['independent', 'side-by-side', 'merged'].includes(request.layout) ||
    (request.deviceKeys !== undefined && (!Array.isArray(request.deviceKeys) || request.deviceKeys.length > 64 ||
      !request.deviceKeys.every(key => typeof key === 'string' && key.length > 0 && key.length <= 256))))
    throw new Error('Invalid mirror layout request')
  const keys = request.deviceKeys === undefined ? undefined : new Set(request.deviceKeys)
  const selected = () => provider().filter(source => !source.window.isDestroyed() && (!keys || keys.has(source.deviceKey)))
  if (!selected().length) throw new Error('No active mirrors selected')
  arranged = ''
  if (request.layout === 'merged') { showMergedMirrors(selected); return }
  closeMergedMirrors()
  const windows: BrowserWindow[] = selected().map(source => source.window)
  if (request.layout === 'side-by-side') {
    arrangeMirrors(windows, area)
    if (!keys) arranged = geometry(provider)
  }
  else for (const window of windows) { if (window.isMinimized()) window.restore(); window.show() }
}
