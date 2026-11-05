import type { BrowserWindow, Rectangle } from 'electron'
import type { MirrorLayoutRequest } from 'common/types'
import type { MirrorSource } from './mergedMirrors'
import { closeMergedMirrors, showMergedMirrors } from './mergedMirrors'
import { arrangeMirrors } from './arrangeMirrors'

export function applyMirrorLayout(request: MirrorLayoutRequest, provider: () => MirrorSource[], area: Rectangle) {
  if (!request || !['independent', 'side-by-side', 'merged'].includes(request.layout) ||
    (request.deviceKeys !== undefined && (!Array.isArray(request.deviceKeys) || request.deviceKeys.length > 64 ||
      !request.deviceKeys.every(key => typeof key === 'string' && key.length > 0 && key.length <= 256))))
    throw new Error('Invalid mirror layout request')
  const keys = request.deviceKeys === undefined ? undefined : new Set(request.deviceKeys)
  const selected = () => provider().filter(source => !source.window.isDestroyed() && (!keys || keys.has(source.deviceKey)))
  if (!selected().length) throw new Error('No active mirrors selected')
  if (request.layout === 'merged') { showMergedMirrors(selected); return }
  closeMergedMirrors()
  const windows: BrowserWindow[] = selected().map(source => source.window)
  if (request.layout === 'side-by-side') arrangeMirrors(windows, area)
  else for (const window of windows) { if (window.isMinimized()) window.restore(); window.show() }
}
