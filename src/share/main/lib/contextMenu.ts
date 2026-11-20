import { Menu } from 'electron'
import type {
  BrowserWindow,
  MenuItemConstructorOptions,
  WebContents,
} from 'electron'

export default function contextMenu(
  win: BrowserWindow,
  sender: WebContents,
  x: number,
  y: number,
  template: MenuItemConstructorOptions[],
) {
  function bind(items: MenuItemConstructorOptions[]) {
    for (const item of items) {
      if (typeof item.click === 'string') {
        const id = item.click
        item.click = () => {
          if (!sender.isDestroyed()) sender.send('clickContextMenu', id)
        }
      }
      if (Array.isArray(item.submenu)) bind(item.submenu)
    }
  }
  bind(template)
  Menu.buildFromTemplate(template).popup({
    window: win,
    x: Math.round(x),
    y: Math.round(y),
  })
}
