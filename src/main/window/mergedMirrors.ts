import { screen } from 'electron'
import type { BrowserWindow, WebContents, WebContentsView } from 'electron'
import type { MirrorPlatform } from 'common/types'
import * as windows from 'share/main/lib/window'

export interface MirrorSource {
  window: windows.MirrorWindow
  platform: MirrorPlatform
  deviceKey: string
  claimGui?(): void
}

interface Tile {
  id: number
  source: MirrorSource
  view: WebContentsView
  contents: WebContents
  visible: boolean
  hide(): void
  label(): void
  enterFullscreen(): void
  leaveFullscreen(): void
}

const labels = { android: 'Android', harmony: 'HarmonyOS', ios: 'iOS' }
const order = Object.keys(labels)
// Keep AppKit’s non-interactive strip above the visible content. The renderer
// offsets its header by the same amount so its buttons stay inside the hit area.
const toolInset = process.platform === 'darwin' ? 28 : 0
const gap = 12,
  header = 32
let host: BrowserWindow | undefined
let sources: () => MirrorSource[] = () => []
let interval: ReturnType<typeof setInterval> | undefined
let layoutKey = ''
let fullscreenTile: Tile | undefined
let requestedFocus: Tile | undefined
const tiles = new Map<number, Tile>()

function attach(source: MirrorSource, parent: BrowserWindow) {
  const child = source.window,
    view = child.mirrorView!
  const tile: Tile = {
    id: child.id,
    source,
    view,
    contents: view.webContents,
    visible: !child.isMinimized(),
    hide: () => child.hide(),
    label: () =>
      view.webContents.send('mergedMirrorLabel', labels[source.platform], toolInset),
    enterFullscreen: () => {
      fullscreenTile = tile
      position()
    },
    leaveFullscreen: () => {
      if (fullscreenTile === tile) fullscreenTile = undefined
      position()
    },
  }
  tiles.set(child.id, tile)
  child.mirrorHost = parent
  child.focusMirrorTile = async () => {
    requestedFocus = tile
    if (parent.isMinimized()) parent.restore()
    parent.show()
    parent.focus()
    if (fullscreenTile && fullscreenTile !== tile) {
      await fullscreenTile.contents.executeJavaScript(
        'document.fullscreenElement && document.exitFullscreen()',
      )
    }
    if (requestedFocus === tile && !tile.contents.isDestroyed()) tile.contents.focus()
  }
  child.on('show', tile.hide)
  view.webContents.on('did-finish-load', tile.label)
  view.webContents.on('enter-html-full-screen', tile.enterFullscreen)
  view.webContents.on('leave-html-full-screen', tile.leaveFullscreen)
  child.contentView.removeChildView(view)
  parent.contentView.addChildView(view)
  child.hide()
  tile.label()
}

function release(tile: Tile) {
  const { window: child } = tile.source
  tiles.delete(tile.id)
  if (fullscreenTile === tile) fullscreenTile = undefined
  if (requestedFocus === tile) requestedFocus = undefined
  child.removeListener('show', tile.hide)
  const { view, contents } = tile
  contents.removeListener('did-finish-load', tile.label)
  contents.removeListener('enter-html-full-screen', tile.enterFullscreen)
  contents.removeListener('leave-html-full-screen', tile.leaveFullscreen)
  const parent = child.mirrorHost
  child.mirrorHost = undefined
  child.focusMirrorTile = undefined
  if (parent && !parent.isDestroyed()) parent.contentView.removeChildView(view)
  if (child.isDestroyed() || contents.isDestroyed()) return
  view.setVisible(true)
  child.contentView.addChildView(view)
  const [width, height] = child.getContentSize()
  view.setBounds({ x: 0, y: 0, width, height })
  contents.send('mergedMirrorLabel', '')
  if (tile.visible) child.show()
}

function sortedTiles() {
  return [...tiles.values()].sort(
    (a, b) =>
      order.indexOf(a.source.platform) - order.indexOf(b.source.platform),
  )
}
function ratio(tile: Tile) {
  return tile.source.window.mirrorRatio || 9 / 19.5
}

function position() {
  if (!host || host.isDestroyed()) return
  const [width, height] = host.getContentSize()
  const sorted = sortedTiles()
  const total = sorted.reduce((sum, tile) => sum + ratio(tile), 0)
  const available = Math.max(1, width - (sorted.length - 1) * gap)
  let sum = 0
  sorted.forEach((tile, i) => {
    if (tile.contents.isDestroyed()) return
    const left = Math.round((available * sum) / total)
    sum += ratio(tile)
    const visible = !fullscreenTile || fullscreenTile === tile
    tile.view.setVisible(visible)
    if (visible)
      tile.view.setBounds(
        fullscreenTile
          ? { x: 0, y: 0, width, height }
          : {
              x: i * gap + left,
              y: -toolInset,
              width: Math.max(1, Math.round((available * sum) / total) - left),
              height: Math.max(1, height) + toolInset,
            },
      )
  })
}

function sync() {
  if (!host || host.isDestroyed()) return
  const active = sources().filter(
    (s) => !s.window.isDestroyed() && s.window.mirrorView,
  )
  const ids = new Set(active.map((s) => s.window.id))
  for (const [id, tile] of tiles) if (!ids.has(id)) release(tile)
  for (const source of active)
    if (!tiles.has(source.window.id)) attach(source, host)
  if (!tiles.size) {
    closeMergedMirrors()
    return
  }
  const pinned = active.some((source) => source.window.isAlwaysOnTop())
  if (host.isAlwaysOnTop() !== pinned) host.setAlwaysOnTop(pinned)
  const sorted = sortedTiles()
  const key = sorted
    .map((tile) => [tile.source.window.id, ratio(tile)].join('/'))
    .join(',')
  if (key === layoutKey) return
  layoutKey = key
  if (!host.isFullScreen() && !host.isMaximized()) {
    const frame = host.getBounds(),
      content = host.getContentBounds()
    const area = screen.getDisplayMatching(frame).workArea
    const total = sorted.reduce((sum, tile) => sum + ratio(tile), 0)
    const horizontal =
      frame.width - content.width + (sorted.length - 1) * gap
    const vertical = frame.height - content.height + header
    const picture = Math.max(
      1,
      Math.min(
        frame.width - horizontal,
        area.width - horizontal,
        (area.height - vertical) * total,
      ),
    )
    const width = Math.round(picture + horizontal),
      height = Math.round(picture / total + vertical)
    host.setMinimumSize(Math.min(320, width), Math.min(200, height))
    host.setBounds({
      x: Math.max(area.x, Math.min(frame.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(frame.y, area.y + area.height - height)),
      width,
      height,
    })
  }
  position()
}

export function getMergedMirrorWindow(deviceKey?: string) {
  if (!host || host.isDestroyed()) return undefined
  if (deviceKey) {
    sync()
    if (![...tiles.values()].some(tile => tile.source.deviceKey === deviceKey)) return undefined
  }
  return host
}

function detachAll(parent: BrowserWindow) {
  if (host !== parent) return
  clearInterval(interval)
  host = undefined
  for (const tile of tiles.values()) release(tile)
  layoutKey = ''
}

export function closeMergedMirrors() {
  const parent = host
  if (parent) {
    detachAll(parent)
    if (!parent.isDestroyed()) parent.close()
  }
}

export function showMergedMirrors(provider: () => MirrorSource[]) {
  sources = provider
  if (host && !host.isDestroyed()) {
    sync()
    host?.show()
    host?.focus()
    return
  }
  const parent = windows.create({
    name: 'merged-mirrors',
    width: 1200,
    height: 850,
    minWidth: 320,
    minHeight: 200,
    customTitlebar: false,
    acceptFirstMouse: true,
    preload: false,
  })
  parent.setTitle('Scrcpy Plus')
  host = parent
  parent.on('resize', position)
  parent.on('close', () => detachAll(parent))
  parent.on('closed', () => detachAll(parent))
  interval = setInterval(sync, 250)
  sync()
  if (host) parent.show()
}
