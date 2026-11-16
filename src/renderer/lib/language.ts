import { i18n } from 'common/util'
import LunaModal from 'luna-modal'

// Initialize before loading pages, then update existing views without remounting.
export function applyLanguage(language: string) {
  LunaModal.i18n.locale(language)
  document.documentElement.lang = language
  i18n.locale(language)
}

export async function initLanguage() {
  // Subscribe before the initial IPC read so an older reply cannot undo a change.
  let received = false
  main.on('updateLanguage', (language: string) => {
    received = true
    applyLanguage(language)
  })
  const language = await main.getLanguage()
  if (!received) applyLanguage(language)
}
