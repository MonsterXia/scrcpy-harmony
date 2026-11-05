import type { BrowserWindow, Rectangle } from 'electron'

export function arrangeMirrors(windows: BrowserWindow[], area: Rectangle) {
  const visible = windows.filter(win => !win.isDestroyed())
  if (!visible.length) return
  const gap = 12, cellWidth = area.width / visible.length
  visible.forEach((win, index) => {
    if (win.isMinimized()) win.restore()
    if (win.isMaximized()) win.unmaximize()
    if (win.isFullScreen()) return
    const bounds = win.getBounds()
    const scale = Math.min((cellWidth - gap) / bounds.width, (area.height - gap * 2) / bounds.height)
    const width = Math.max(1, Math.floor(bounds.width * scale)), height = Math.max(1, Math.floor(bounds.height * scale))
    win.setMinimumSize(Math.min(240, width), Math.min(320, height))
    win.setBounds({ x: Math.round(area.x + cellWidth * index + (cellWidth - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2), width, height })
    win.show()
  })
}
