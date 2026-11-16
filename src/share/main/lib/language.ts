import { getSettingsStore } from '../../../main/lib/store'
import { i18n, resolveLocale } from '../../common/i18n'
import { app } from 'electron'
import { handleEvent } from './util'
import log from '../../common/log'
import { IpcGetLanguage } from '../../common/types'
import * as window from './window'

const logger = log('language')

const store = getSettingsStore()

let language = 'en-US'
export const get: IpcGetLanguage = function () {
  return language
}

function update() {
  const lang = store.get('language')
  const systemLanguage = resolveLocale(app.getLocale()) || 'en-US'

  if (lang === 'system') {
    language = systemLanguage
  } else {
    language = resolveLocale(lang) || systemLanguage
  }

  i18n.locale(language)
}

export function init() {
  logger.info('init')
  update()
  handleEvent('getLanguage', get)
  store.on('change', (name) => {
    if (name !== 'language') return
    const previous = language
    update()
    if (previous !== language) window.sendAll('updateLanguage', language)
  })
}
