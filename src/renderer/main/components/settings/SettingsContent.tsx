import { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import store from '../../store'
import Style from './SettingsContent.module.scss'

export default observer(function SettingsContent() {
  const settings = store.settings
  const [path, setPath] = useState(settings.hdcPath)
  const [pending, setPending] = useState<string[]>([])
  const busy = useRef(new Set<string>())
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => setPath(settings.hdcPath), [settings.hdcPath])
  async function save(name: string, value: any) {
    if (busy.current.has(name)) return
    busy.current.add(name)
    setPending([...busy.current])
    setError('')
    setStatus('')
    try {
      await settings.set(name, value)
      if (active.current)
        setStatus(
          t(
            name === 'language' || name === 'hdcPath'
              ? 'requireReload'
              : 'workspaceSettingsSaved',
          ),
        )
    } catch {
      if (active.current) setError(t('settingsSaveFailed'))
    } finally {
      busy.current.delete(name)
      if (active.current) setPending([...busy.current])
    }
  }
  async function browse() {
    if (busy.current.has('hdcPath')) return
    try {
      const result = await main.showOpenDialog({ properties: ['openFile'] })
      if (active.current && !result.canceled && result.filePaths.length) {
        setPath(result.filePaths[0])
        await save('hdcPath', result.filePaths[0])
      }
    } catch {
      if (active.current) setError(t('workspaceBrowseFailed'))
    }
  }
  return (
    <div className={Style.page} data-settings>
      <header className={Style.heading}>
        <h1>{t('settings')}</h1>
        <p>{t('workspaceSettingsHint')}</p>
      </header>
      {error && (
        <div role="alert" className={Style.error}>
          {error}
        </div>
      )}
      {status && (
        <div role="status" className={Style.status}>
          {status}
        </div>
      )}
      <section className={Style.card}>
        <h2>{t('appearance')}</h2>
        <label className={Style.row}>
          <span>
            <strong>{t('language')}</strong>
            <small>{t('languageRestartHint')}</small>
          </span>
          <select
            aria-label={t('language')}
            value={settings.language}
            disabled={pending.includes('language')}
            onChange={(e) => void save('language', e.target.value)}
          >
            <option value="system">{t('sysPreference')}</option>
            <option value="en-US">{t('workspaceEnglish')}</option>
            <option value="zh-CN">{t('workspaceChinese')}</option>
          </select>
        </label>
        <label className={Style.row}>
          <strong>{t('theme')}</strong>
          <select
            aria-label={t('theme')}
            value={settings.theme}
            disabled={pending.includes('theme')}
            onChange={(e) => void save('theme', e.target.value)}
          >
            <option value="system">{t('sysPreference')}</option>
            <option value="light">{t('light')}</option>
            <option value="dark">{t('dark')}</option>
          </select>
        </label>
      </section>
      <section className={Style.card}>
        <h2>{t('workspaceHdc')}</h2>
        <label className={Style.pathLabel} htmlFor="settings-hdc-path">
          {t('hdcPath')}
        </label>
        <p>{t('workspaceHdcPathHint')}</p>
        <form
          className={Style.path}
          onSubmit={(event) => {
            event.preventDefault()
            void save('hdcPath', path)
          }}
        >
          <input
            id="settings-hdc-path"
            value={path}
            spellCheck={false}
            onChange={(e) => setPath(e.target.value)}
            disabled={pending.includes('hdcPath')}
          />
          <button
            type="button"
            disabled={pending.includes('hdcPath')}
            onClick={() => void browse()}
          >
            {t('browse')}
          </button>
          <button
            type="submit"
            disabled={pending.includes('hdcPath') || path === settings.hdcPath}
          >
            {t('save')}
          </button>
        </form>
        <label className={Style.row}>
          <span>{t('killHdcWhenExit')}</span>
          <input
            type="checkbox"
            checked={settings.killHdcWhenExit}
            disabled={pending.includes('killHdcWhenExit')}
            onChange={(e) => void save('killHdcWhenExit', e.target.checked)}
          />
        </label>
      </section>
      <section className={Style.card}>
        <h2>{t('workspaceUpdates')}</h2>
        <label className={Style.row}>
          <span>
            <strong>{t('betaUpdate')}</strong>
            <small>{t('workspaceBetaHint')}</small>
          </span>
          <input
            type="checkbox"
            checked={settings.betaUpdate}
            disabled={pending.includes('betaUpdate')}
            onChange={(e) => void save('betaUpdate', e.target.checked)}
          />
        </label>
      </section>
      <section className={Style.card}>
        <h2>{t('workspaceProduct')}</h2>
        <div className={Style.row}>
          <span>{t('languageRestartHint')}</span>
          <button
            type="button"
            onClick={async () => {
              try {
                await main.relaunch()
              } catch {
                setError(t('commonErr'))
              }
            }}
          >
            {t('restartApp')}
          </button>
        </div>
      </section>
    </div>
  )
})
