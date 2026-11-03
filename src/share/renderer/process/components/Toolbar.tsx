import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import store from '../store'
import { t } from '../../../common/i18n'
import { IProcess } from '../../../common/types'
import { isDev } from '../../../common/util'
import ToolConfirm from '../../tool-window/ToolConfirm'
import Style from './Toolbar.module.scss'

export default observer(function Toolbar() {
  const [confirmation, setConfirmation] = useState<IProcess | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const mounted = useRef(true)
  const busyRef = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function stop() {
    const process = confirmation
    setConfirmation(null)
    if (
      !process ||
      busyRef.current ||
      !store.processes.some((item) => item.pid === process.pid)
    )
      return
    busyRef.current = true
    setBusy(true)
    setError(false)
    try {
      await main.killProcess(process.pid)
      if (mounted.current) await store.refresh()
    } catch {
      if (mounted.current) setError(true)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function inspect() {
    const process = store.process
    if (!process) return
    try {
      if (process.webContentsId) await main.openDevtools(process.webContentsId)
      else await main.debugMainProcess()
    } catch {
      if (mounted.current) setError(true)
    }
  }
  const process = store.process
  const debuggable = !!(
    process &&
    (process.webContentsId || (isDev() && process.type === 'Browser'))
  )
  return (
    <>
      <div className={Style.container} inert={confirmation ? true : undefined}>
        <input
          type="search"
          value={store.filter}
          placeholder={t('filter')}
          aria-label={t('filter')}
          onChange={(event) => store.setFilter(event.target.value)}
        />
        <span className={Style.total}>
          {t('totalProcess', { total: store.processes.length })}
        </span>
        <button
          type="button"
          disabled={!debuggable || busy}
          onClick={() => {
            void inspect()
          }}
        >
          {t('inspect')}
        </button>
        <button
          type="button"
          disabled={!process || busy}
          onClick={() => setConfirmation(process)}
        >
          {t('stop')}
        </button>
        <button
          type="button"
          disabled={store.loading || busy}
          onClick={() => {
            void store.refresh()
          }}
        >
          {t('refresh')}
        </button>
      </div>
      {error && (
        <div role="alert" className={Style.error}>
          {t('toolProcessActionError')}
        </div>
      )}
      <ToolConfirm
        visible={!!confirmation}
        title={t('stop')}
        message={t('killProcessConfirm', { name: confirmation?.name || '' })}
        confirmLabel={t('stop')}
        onConfirm={() => {
          void stop()
        }}
        onCancel={() => setConfirmation(null)}
      />
    </>
  )
})
