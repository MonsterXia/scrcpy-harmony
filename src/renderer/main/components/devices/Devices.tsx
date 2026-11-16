import { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import type { ITarget, MirrorLayout, MirrorSession } from 'common/types'
import store from '../../store'
import Style from './Devices.module.scss'

const receiverKey = 'ios:airplay-receiver'
const retryable = (session: MirrorSession) => ['error', 'disconnected'].includes(session.state)
const ready = (device: ITarget) => device.transport !== 'receiver' && device.state === 'ready'
const platformName = (platform?: string) => platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : 'HarmonyOS'
function sessionStatus(state: MirrorSession['state']) {
  switch (state) {
    case 'running': return t('plusNativeConnected')
    case 'authorizing': return t('plusAuthorizing')
    case 'waiting': return t('plusSessionWaiting')
    case 'error': return t('plusSessionError')
    case 'disconnected': return t('plusSessionStopped')
    case 'stopping': return t('plusSessionStopping')
    default: return t('plusSessionStarting')
  }
}
function deviceStatus(device: ITarget) {
  switch (device.state) {
    case 'unauthorized': return t('plusAuthorizationRequired')
    case 'offline': return t('plusDeviceOffline')
    case 'ready': return t('plusReadyToMirror')
    default: return t('plusDeviceUnavailable')
  }
}

export default observer(function Devices() {
  const [sessions, setSessions] = useState<MirrorSession[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [failures, setFailures] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [layout, setLayout] = useState<MirrorLayout>('independent')
  const alive = useRef(false), operation = useRef(false), revision = useRef(0)
  const activePanel = store.panel === 'devices'
  const available = store.targets.filter(device => device.transport !== 'receiver' && !sessions.some(session => session.deviceKey === device.key))
  const selectable = available.filter(ready).map(device => device.key)
  const selection = selected.filter(key => selectable.includes(key))
  const selectionScope = JSON.stringify(selectable)
  const receiver = sessions.find(session => session.deviceKey === receiverKey)
  const deviceSessions = sessions.filter(session => session.deviceKey !== receiverKey)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; revision.current++ }
  }, [])
  useEffect(() => {
    const keys: string[] = JSON.parse(selectionScope)
    setSelected(previous => previous.filter(key => keys.includes(key)))
  }, [selectionScope])
  useEffect(() => {
    if (!activePanel) return
    let cancelled = false, timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (!operation.current) {
        try { await readSessions() }
        catch { if (!cancelled && alive.current) setError('plusSessionRefreshFailed') }
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 1500)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer); revision.current++ }
  }, [activePanel])

  async function readSessions() {
    const request = ++revision.current
    try {
      const [next, nextLayout] = await Promise.all([main.getMirrorSessions(), main.getMirrorLayout()])
      if (alive.current && request === revision.current) {
        setSessions(next); setLayout(nextLayout)
        setError(previous => previous === 'plusSessionRefreshFailed' ? '' : previous)
      }
    } catch (error) {
      if (alive.current && request === revision.current) throw error
    }
  }
  async function run(name: string, failure: string, action: () => Promise<void>) {
    if (operation.current) return
    operation.current = true; revision.current++
    setBusy(name); setError('')
    try { await action() }
    catch { if (alive.current) setError(failure) }
    finally {
      try { await readSessions() }
      catch { if (alive.current) setError('plusSessionRefreshFailed') }
      operation.current = false
      if (alive.current) setBusy('')
    }
  }
  async function start(keys: string[]) {
    await run('start', 'plusStartFailed', async () => {
      await store.refreshTargets()
      const current = await main.getMirrorSessions()
      const failed: string[] = [], succeeded: string[] = []
      await Promise.all(keys.map(async key => {
        const existing = current.find(session => session.deviceKey === key)
        if (existing && !retryable(existing)) { succeeded.push(key); return }
        const device = store.targets.find(device => device.key === key)
        if (!device || (key !== receiverKey && !ready(device))) { failed.push(key); return }
        try { await main.showScreencast(key); succeeded.push(key) }
        catch { failed.push(key) }
      }))
      if (!alive.current) return
      setFailures(previous => [...previous.filter(key => !keys.includes(key)), ...failed])
      setSelected(previous => previous.filter(key => !succeeded.includes(key)))
      if (failed.some(key => !store.targets.some(device => device.key === key))) setError('targetNotConnected')
    })
  }
  const focus = (key: string) => run('focus', 'plusFocusFailed', () => main.focusMirror(key))
  const stop = (id: string) => run(`stop:${id}`, 'plusStopFailed', () => main.stopMirrorSession(id))
  const applyLayout = (next: MirrorLayout) => run('layout', 'plusLayoutFailed', () => main.applyMirrorLayout({ layout: next }))
  function toggle(key: string) {
    setSelected(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key])
  }

  const errorMessages: Record<string, string> = {
    plusSessionRefreshFailed: t('plusSessionRefreshFailed'), plusStartFailed: t('plusStartFailed'),
    targetNotConnected: t('targetNotConnected'), plusFocusFailed: t('plusFocusFailed'),
    plusStopFailed: t('plusStopFailed'), plusLayoutFailed: t('plusLayoutFailed'), targetRefreshFailed: t('targetRefreshFailed'),
  }
  return <div className={Style.page} data-mirror-workspace>
    <header className={Style.heading}>
      <div><h1>{t('plusDevices')}</h1><p>{t('plusDevicesHint')}</p></div>
      <button type="button" className={Style.quiet} data-action="refresh-devices" disabled={!!busy}
        onClick={() => void run('refresh', 'targetRefreshFailed', async () => { await store.refreshTargets() })}>
        <span className="icon-refresh" aria-hidden="true" />{t(busy === 'refresh' ? 'workspaceRefreshing' : 'refresh')}
      </button>
    </header>
    {!!store.discoveryErrors.length && <p className={Style.notice} role="status">{t('plusDiscoveryWarning', { backends: store.discoveryErrors.join(', ') })}</p>}
    {store.targetsError && <p className={Style.notice} role="alert">{t('targetRefreshFailed')}</p>}
    {error && <p className={Style.notice} role="alert">{errorMessages[error]}</p>}
    <section aria-labelledby="available-devices-heading" className={Style.section}>
      <div className={Style.sectionHeading}><h2 id="available-devices-heading">{t('plusAvailableDevices')}<span className={Style.count}>{available.length}</span></h2></div>
      <div className={Style.deviceList}>
        {!available.length && <p className={Style.empty}>{t('plusNoAvailableDevices')}</p>}
        {available.map(device => <div key={device.key} className={`${Style.deviceRow} ${selection.includes(device.key) ? Style.selected : ''}`} data-device-row={device.key}>
          <input type="checkbox" checked={selection.includes(device.key)} disabled={!!busy || !ready(device)}
            aria-label={t('plusSelectDevice', { name: device.name })} onChange={() => toggle(device.key)} />
          <span className={Style.deviceIcon} aria-hidden="true"><span className="icon-phone" /></span>
          <div className={Style.identity}><strong>{device.name}</strong><small>{platformName(device.platform)}{device.transport ? ` · ${device.transport === 'usb' ? 'USB' : t('plusWireless')}` : ''}</small>
            {failures.includes(device.key) && <small className={Style.error} role="alert">{t('plusDeviceStartFailed')}</small>}
          </div>
          <span title={device.state === 'unauthorized' ? t('plusDebugAuthorizationHint') : device.state === 'offline' ? t('plusOfflineHint') : undefined} className={`${Style.status} ${ready(device) ? Style.connected : ''}`}><i />{deviceStatus(device)}</span>
          <button type="button" data-action="start-device" disabled={!!busy || !ready(device)} onClick={() => void start([device.key])}>{t('workspaceStartMirroring')}</button>
        </div>)}
      </div>
      <div className={Style.selectionBar}><span>{t('plusSelectedCount', { count: selection.length })}</span>
        <button type="button" data-action="start-selected" className={Style.primary} disabled={!!busy || !selection.length} onClick={() => void start(selection)}>
          <span className="icon-play" aria-hidden="true" />{t(busy === 'start' ? 'plusStartingSelected' : 'plusStartSelectedCount', { count: selection.length })}
        </button>
      </div>
    </section>
    <section aria-labelledby="mirror-sessions-heading" className={Style.section}>
      <div className={Style.sectionHeading}>
        <h2 id="mirror-sessions-heading">{t('plusSessions')}<span className={Style.count}>{deviceSessions.length}</span></h2>
        <div className={Style.layoutControls}><span>{t('plusLayoutScope', { count: sessions.length })}</span>
          <div className={Style.segmented} role="group" aria-label={t('plusLayoutMode')}>
            {(['independent', 'side-by-side', 'merged'] as const).map(value => <button type="button" key={value} data-layout={value}
              aria-pressed={layout === value} disabled={!!busy || !sessions.length} onClick={() => void applyLayout(value)}>
              {t(value === 'independent' ? 'plusLayoutIndependent' : value === 'side-by-side' ? 'plusLayoutSideBySide' : 'plusLayoutMerged')}
            </button>)}
          </div>
        </div>
      </div>
      {!deviceSessions.length && <p className={Style.empty}>{t('plusNoSessions')}</p>}
      {deviceSessions.map(session => <div className={Style.sessionRow} key={session.id} data-session-row={session.deviceKey}>
        <span className={Style.deviceIcon} aria-hidden="true"><span className="icon-phone" /></span>
        <div className={Style.identity}><strong>{session.name}</strong><small>{platformName(session.platform)}</small>
          {failures.includes(session.deviceKey) && <small className={Style.error} role="alert">{t('plusDeviceStartFailed')}</small>}
        </div>
        <span className={`${Style.status} ${session.state === 'running' ? Style.connected : retryable(session) ? Style.error : ''}`}><i />{sessionStatus(session.state)}</span>
        <div className={Style.rowActions}>
          {retryable(session) && <button type="button" data-action="retry" disabled={!!busy || !store.targets.some(device => device.key === session.deviceKey && ready(device))} onClick={() => void start([session.deviceKey])}>{t('plusRetry')}</button>}
          <button type="button" data-action="focus" disabled={!!busy || session.state === 'stopping'} onClick={() => void focus(session.deviceKey)}>{t('plusOpenWindow')}</button>
          <button type="button" data-action="stop" className={Style.quiet} disabled={!!busy || session.state === 'stopping'} onClick={() => void stop(session.id)}>{t('stop')}</button>
        </div>
      </div>)}
    </section>
    <section className={Style.receiver} aria-labelledby="airplay-heading">
      <span className={Style.receiverIcon} aria-hidden="true"><span className="icon-screencast" /></span>
      <div className={Style.receiverTitle}><h2 id="airplay-heading">{t('plusIosWireless')}</h2>{receiver && <small className={Style.status}>{sessionStatus(receiver.state)}</small>}</div>
      <div className={Style.receiverHint}><p>{t('plusAirplayHint')}</p>{failures.includes(receiverKey) && <small className={Style.error} role="alert">{t('plusDeviceStartFailed')}</small>}</div>
      <div className={Style.rowActions}>
        {(!receiver || retryable(receiver)) && <button type="button" data-action="start-receiver" disabled={!!busy} onClick={() => void start([receiverKey])}>{t(receiver ? 'plusRetry' : 'plusStartReceiver')}</button>}
        {receiver && <>
          <button type="button" data-action="focus-receiver" disabled={!!busy || receiver.state === 'stopping'} onClick={() => void focus(receiverKey)}>{t('plusOpenWindow')}</button>
          <button type="button" className={Style.quiet} disabled={!!busy || receiver.state === 'stopping'} onClick={() => void stop(receiver.id)}>{t('stop')}</button>
        </>}
      </div>
    </section>
  </div>
})
