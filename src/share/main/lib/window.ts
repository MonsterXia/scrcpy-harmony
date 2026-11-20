import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  WebContentsView,
  screen,
} from 'electron'
import types from 'licia/types'
import defaults from 'licia/defaults'
import each from 'licia/each'
import path from 'path'
import { attachTitlebarToWindow } from 'custom-electron-titlebar/main'
import { colorBgContainer, colorBgContainerDark } from 'common/theme'
import { getTheme } from './util'
import isWindows from 'licia/isWindows'
import debounce from 'licia/debounce'
import { isDev } from '../../common/util'
import isEmpty from 'licia/isEmpty'
import query from 'licia/query'
import log from '../../common/log'
import once from 'licia/once'
import { getWindowStore } from './store'
import isUndef from 'licia/isUndef'
import extend from 'licia/extend'

const logger = log('window')

const store = getWindowStore()

export interface MirrorWindow extends BrowserWindow {
  mirrorView?: WebContentsView
  mirrorHost?: BrowserWindow
  mirrorRatio?: number
  focusMirrorTile?: () => Promise<void>
  syncMirrorTitlebar?: () => void
}

interface IWinOptions {
  detachable?: boolean
  name: string
  maximized?: boolean
  titlebar?: boolean
  acceptFirstMouse?: boolean
  customTitlebar?: boolean
  minWidth?: number
  minHeight?: number
  width?: number
  height?: number
  preload?: boolean
  webSecurity?: boolean
  menu?: boolean
  x?: number
  y?: number
  onSavePos?: types.AnyFn
  resizable?: boolean
}

const wins: types.PlainObj<MirrorWindow> = {}

const defaultOptions: Partial<IWinOptions> = {
  titlebar: true,
  customTitlebar: true,
  preload: true,
  maximized: false,
  minWidth: 1280,
  minHeight: 850,
  width: 1280,
  height: 850,
  menu: false,
  resizable: true,
}

export function create(opts: IWinOptions) {
  defaults(opts, defaultOptions)

  if (isUndef(opts.onSavePos)) {
    opts.onSavePos = function () {
      const isMaximized = win.isMaximized()
      const data = store.get(opts.name) || {}
      if (!isWindows || !isMaximized) {
        data.bounds = win.getBounds()
      }
      if (isWindows) {
        data.maximized = isMaximized
      }
      store.set(opts.name, data)
    }
    const data = store.get(opts.name) || {}
    if (data.bounds) {
      extend(opts, data.bounds)
    }
    if (data.maximized) {
      opts.maximized = data.maximized
    }
  }

  const winOptions = opts as Required<IWinOptions>

  const options: BrowserWindowConstructorOptions = {
    minWidth: winOptions.minWidth,
    minHeight: winOptions.minHeight,
    show: false,
    acceptFirstMouse: opts.acceptFirstMouse,
    resizable: winOptions.resizable,
  }
  if (!options.resizable) {
    options.maximizable = false
    options.minimizable = false
  }
  if (winOptions.x && winOptions.y) {
    const x = winOptions.x
    const y = winOptions.y
    const width = winOptions.width
    const height = winOptions.height
    const area = screen.getDisplayMatching({
      x,
      y,
      width,
      height,
    }).workArea
    if (
      x >= area.x &&
      x + width <= area.x + area.width &&
      y >= area.y &&
      y + height <= area.y + area.height
    ) {
      options.x = winOptions.x
      options.y = winOptions.y
    }
    if (width <= area.width && height <= area.height) {
      options.width = winOptions.width
      options.height = winOptions.height
    }
  } else {
    options.width = winOptions.width
    options.height = winOptions.height
  }

  options.backgroundColor = getTheme() ? colorBgContainerDark : colorBgContainer

  if (winOptions.preload) {
    options.webPreferences = {
      preload: path.join(__dirname, '../preload/index.js'),
      webSecurity: opts.webSecurity ?? false,
      sandbox: false,
    }
  }

  if (winOptions.titlebar) {
    if (winOptions.customTitlebar) {
      options.titleBarStyle = 'hidden'
      options.titleBarOverlay = true
    }
  } else {
    options.frame = false
  }

  logger.debug('create', opts.name, options)
  const preferences = options.webPreferences
  if (opts.detachable) delete options.webPreferences
  const win: MirrorWindow = new BrowserWindow(options)
  if (opts.detachable) {
    const view = new WebContentsView({ webPreferences: preferences })
    const contents = view.webContents
    win.mirrorView = view
    win.contentView.addChildView(view)
    const resize = () => {
      if (!win.mirrorHost) {
        const [width, height] = win.getContentSize()
        view.setBounds({ x: 0, y: 0, width, height })
      }
    }
    resize()
    win.on('resize', resize)
    win.on('focus', () => { if (!win.mirrorHost) contents.focus() })
    contents.on('page-title-updated', (_event, title) => { if (!win.isDestroyed()) win.setTitle(title) })
    win.once('closed', () => { if (!contents.isDestroyed()) contents.close() })
  }
  ;(win as any).customTitlebar =
    winOptions.titlebar && winOptions.customTitlebar
  if (!winOptions.menu) {
    win.setMenu(null)
  }

  const onSavePos = debounce(() => {
    if (!win.isDestroyed() && !win.isFullScreen()) {
      winOptions.onSavePos()
    }
  }, 1000)

  const readyAndShow = once(() => {
    if (win.isDestroyed()) return
    logger.info(opts.name, 'ready and show')
    if (winOptions.maximized && isWindows) {
      win.maximize()
    }
    win.show()
    win.on('resize', onSavePos)
    win.on('moved', onSavePos)
  })
  win.once('ready-to-show', () => {
    logger.info(opts.name, 'on ready-to-show')
    readyAndShow()
  })
  // Make sure the window is shown even if the ready-to-show event is not emitted
  setTimeout(() => readyAndShow(), 1000)

  win.on('focus', () => pageContents(win).send('focusWin'))
  win.on('closed', () => {
    if (wins[opts.name] === win) delete wins[opts.name]
  })
  wins[opts.name] = win

  if (winOptions.titlebar && winOptions.customTitlebar) {
    if (win.mirrorView) attachMirrorTitlebar(win, win.mirrorView.webContents)
    else attachTitlebarToWindow(win)
    win.setMinimumSize(winOptions.minWidth, winOptions.minHeight)
  }

  return win
}

function attachMirrorTitlebar(win: MirrorWindow, contents: Electron.WebContents) {
  // custom-electron-titlebar's standard attachment sends to the empty shell.
  const send = (channel: string, value: boolean) => {
    if (!win.mirrorHost && !win.isDestroyed() && !contents.isDestroyed()) contents.send(channel, value)
  }
  win.on('enter-full-screen', () => send('window-fullscreen', true))
  win.on('leave-full-screen', () => send('window-fullscreen', false))
  win.on('maximize', () => send('window-maximize', true))
  win.on('unmaximize', () => send('window-maximize', false))
  win.on('focus', () => send('window-focus', true))
  win.on('blur', () => send('window-focus', false))
  win.syncMirrorTitlebar = () => {
    if (win.isDestroyed()) return
    send('window-fullscreen', win.isFullScreen())
    send('window-maximize', win.isMaximized())
    send('window-focus', win.isFocused())
  }
  contents.on('did-finish-load', win.syncMirrorTitlebar)
}

export function setDefaultOptions(opts: Partial<IWinOptions>) {
  extend(defaultOptions, opts)
}

export function sendAll(channel: string, ...args: any[]) {
  each(wins, (win) => {
    pageContents(win).send(channel, ...args)
  })
}

export function sendTo(name: string, channel: string, ...args: any[]) {
  const win = getWin(name)
  if (win) {
    pageContents(win).send(channel, ...args)
  }
}

export function pageContents(win: MirrorWindow) { return win.mirrorView?.webContents ?? win.webContents }

export function mirrorOwner(contents: Electron.WebContents) {
  return Object.values(wins).find((win: MirrorWindow) => win.mirrorView?.webContents === contents)
}

export function loadPage(win: BrowserWindow, q: types.PlainObj<string> = {}) {
  if (isDev()) {
    let url = 'http://localhost:8080/'
    if (!isEmpty(q)) {
      url += `?${query.stringify(q)}`
    }
    pageContents(win).loadURL(url)
  } else {
    pageContents(win).loadFile(path.resolve(__dirname, '../renderer/index.html'), {
      query: q,
    })
  }
}

export function getWin(name: string) {
  return wins[name]
}

export function savePos(
  win: BrowserWindow | null,
  store: any,
  maximized = false
) {
  if (!win) {
    return
  }

  const isMaximized = win.isMaximized()
  if (!isWindows || !isMaximized) {
    store.set('bounds', win.getBounds())
  }
  if (isWindows && maximized) {
    store.set('maximized', isMaximized)
  }
}
