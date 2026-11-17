import { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import { notify } from 'share/renderer/lib/util'
import store from '../../store'
import Style from '../overview/Overview.module.scss'

export default observer(function DeviceSwitcher() {
  const targets = store.targets.filter(target => target.platform !== 'ios' || target.transport === 'usb')
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false), active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function refresh() {
    if (refreshingRef.current) return
    refreshingRef.current = true; setRefreshing(true)
    try {
      const success = await store.refreshTargets()
      if (active.current && success !== undefined) notify(t(success ? 'targetRefreshed' : 'targetRefreshFailed'), { icon: success ? 'success' : 'error' })
    } catch { if (active.current) notify(t('targetRefreshFailed'), { icon: 'error' }) }
    finally { refreshingRef.current = false; if (active.current) setRefreshing(false) }
  }
  return <div className={Style.deviceSwitcher} data-overview-selector>
    <label htmlFor="workspace-device">{t('workspaceSelectDevice')}</label>
    <select id="workspace-device" value={store.overviewTarget?.key || ''} disabled={!store.ready || !targets.length}
      onChange={event => store.selectOverviewTarget(event.target.value)}>
      {!targets.length && <option value="">{t('targetNotConnected')}</option>}
      {targets.map(target => <option key={target.key} value={target.key}>
        {`${target.platform === 'android' ? 'Android' : target.platform === 'ios' ? 'iOS' : 'HarmonyOS'} · ${target.name} (${target.key})`}
      </option>)}
    </select>
    <button type="button" className={Style.button} data-action="refresh-devices" disabled={!store.ready || refreshing} onClick={refresh}>
      <span className="icon-refresh" aria-hidden="true" />{t(refreshing ? 'workspaceRefreshing' : 'workspaceDetectDevices')}
    </button>
    {store.targetsError && <p role="alert">{t('targetRefreshFailed')}</p>}
  </div>
})
