import { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import { notify } from 'share/renderer/lib/util'
import store from '../../store'
import Style from './Workspace.module.scss'

export default observer(function DeviceSwitcher() {
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)
  const active = useRef(true)
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  useEffect(() => {
    active.current = true
    const closeOutside = (event: PointerEvent) => {
      if (!details.current?.contains(event.target as Node) && details.current)
        details.current.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      active.current = false
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [])
  async function refresh() {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    try {
      const success = await store.refreshTargets()
      if (active.current && success !== undefined)
        notify(t(success ? 'targetRefreshed' : 'targetRefreshFailed'), {
          icon: success ? 'success' : 'error',
        })
    } catch {
      if (active.current) notify(t('targetRefreshFailed'), { icon: 'error' })
    } finally {
      refreshingRef.current = false
      if (active.current) setRefreshing(false)
    }
  }
  return (
    <details
      className={Style.device}
      ref={details}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && details.current?.open) {
          event.stopPropagation()
          details.current.open = false
          summary.current?.focus()
        }
      }}
    >
      <summary
        ref={summary}
        aria-label={t('workspaceSelectDevice')}
        title={store.target?.name || t('workspaceSelectDevice')}
      >
        <span className="icon-phone" aria-hidden="true" />
        <span className={Style.deviceSummary}>
          <strong>{store.target?.name || t('targetNotConnected')}</strong>
          <small>
            {t(
              !store.ready
                ? 'workspaceLoading'
                : store.targetsError
                  ? 'workspaceConnectionError'
                  : store.target
                    ? 'workspaceConnected'
                    : 'workspaceConnectToStart',
            )}
          </small>
        </span>
        <svg
          className={Style.deviceChevron}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className={Style.devicePopover}>
        <label htmlFor="workspace-device">{t('workspaceSelectDevice')}</label>
        <select
          id="workspace-device"
          value={store.target?.key || ''}
          disabled={!store.ready || !store.targets.length}
          onChange={(event) => {
            store.selectTarget(event.target.value)
            if (details.current) details.current.open = false
            summary.current?.focus()
          }}
        >
          {!store.targets.length && (
            <option value="">{t('targetNotConnected')}</option>
          )}
          {store.targets.map((target) => (
            <option
              key={target.key}
              value={target.key}
            >{`${target.name} (${target.key})`}</option>
          ))}
        </select>
        {store.target && <p className={Style.deviceKey}>{store.target.key}</p>}
        {store.targetsError && <p role="alert">{t('targetRefreshFailed')}</p>}
        <button
          type="button"
          className={Style.secondaryButton}
          data-action="refresh-devices"
          disabled={!store.ready || refreshing}
          onClick={refresh}
        >
          <span className="icon-refresh" aria-hidden="true" />
          {t(refreshing ? 'workspaceRefreshing' : 'workspaceDetectDevices')}
        </button>
      </div>
    </details>
  )
})
