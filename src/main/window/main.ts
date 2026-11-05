import { app, BrowserWindow, session, screen } from 'electron'
import { getMainStore, getSettingsStore } from '../lib/store'
import { handleEvent } from 'share/main/lib/util'
import * as window from 'share/main/lib/window'
import * as screencast from './screencast'
import { startSelected, mirrorSessions } from '../lib/devices'
import log from 'share/common/log'
import once from 'licia/once'
import { arrangeMirrors } from './arrangeMirrors'
import { showMergedMirrors } from './mergedMirrors'
import { applyMirrorLayout } from './mirrorLayout'
import type { MirrorLayoutRequest } from 'common/types'

const logger = log('mainWin')

const store = getMainStore()
const settingsStore = getSettingsStore()

let win: BrowserWindow | null = null
let quitting = false

export function showWin() {
  logger.info('show')

  if (win) {
    win.focus()
    return
  }

  init()
  initIpc()

  win = window.create({
    name: 'main',
    minWidth: 960,
    minHeight: 640,
    width: 960,
    height: 640,
    menu: true,
  })

  win.on('close', (e) => {
    if (!quitting && (screencast.hasWindows() || mirrorSessions.list().length)) {
      e.preventDefault()
      win?.hide()
    } else if (!quitting) {
      app.quit()
    }
  })

  window.loadPage(win)
}

const init = once(() => {
  app.on('before-quit', () => { quitting = true })
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['ws://*/*'],
    },
    (details, callback) => {
      delete details.requestHeaders['Origin']
      callback({ requestHeaders: details.requestHeaders })
    }
  )
})

const initIpc = once(() => {
  handleEvent('setMainStore', (name, val) => store.set(name, val))
  handleEvent('getMainStore', (name) => store.get(name))
  store.on('change', (name, val) => {
    window.sendAll('changeMainStore', name, val)
  })
  handleEvent('setSettingsStore', (name, val) => {
    settingsStore.set(name, val)
  })
  handleEvent('getSettingsStore', (name) => settingsStore.get(name))
  settingsStore.on('change', (name, value) => {
    window.sendAll('changeSettingsStore', name, value)
  })
  handleEvent('showScreencast', (key?: string) => startSelected(key || store.get('target')?.key))
  handleEvent('arrangeMirrors', () => {
    if (!win || win.isDestroyed()) return
    arrangeMirrors([...screencast.getWindows(), ...mirrorSessions.getWindows()], screen.getDisplayMatching(win.getBounds()).workArea)
  })
  handleEvent('showMergedMirrors', () => showMergedMirrors(() => [
    ...screencast.getSources(),
    ...mirrorSessions.getSources(),
  ]))
  handleEvent('applyMirrorLayout', (request: MirrorLayoutRequest) => {
    if (!win || win.isDestroyed()) return
    applyMirrorLayout(request, () => [...screencast.getSources(), ...mirrorSessions.getSources()],
      screen.getDisplayMatching(win.getBounds()).workArea)
  })
})
