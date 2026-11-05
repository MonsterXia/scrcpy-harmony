import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import type { MirrorLayout, MirrorSession } from 'common/types'
import store from '../../store'
import Style from './Devices.module.scss'
import { mirrorDeviceKey, targetsForMode } from './modes'
import type { StartMode } from './modes'

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

export default observer(function Devices() {
  const [sessions, setSessions] = useState<MirrorSession[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [startMode, setStartMode] = useState<StartMode>('single')
  const [layoutMode, setLayoutMode] = useState<MirrorLayout>('independent')
  const target = store.mirrorTarget
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try { const result = await main.getMirrorSessions(); if (active) setSessions(result) }
      catch { if (active) setError(t('commonErr')) }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 1500)
    return () => { active = false; clearInterval(timer) }
  }, [])
  async function start(mode: StartMode = startMode) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    const selectedKey = store.mirrorTarget?.key
    try {
      await store.refreshTargets()
      const targets = targetsForMode(store.targets, mode, selectedKey)
      if (!targets.length) { setError(t('targetNotConnected')); return }
      const results = await Promise.allSettled(targets.map(device => main.showScreencast(device.key)))
      const failed = results.flatMap((result, index) => result.status === 'rejected' ? [targets[index].name] : [])
      const expected = mode === 'all' ? ['android', 'harmony', 'ios'] : mode === 'android-harmony' ? ['android', 'harmony'] : []
      const names: Record<string, string> = { android: 'Android', harmony: 'HarmonyOS', ios: 'iOS' }
      const missing = expected.filter(platform => !targets.some(device => device.platform === platform)).map(platform => names[platform])
      const errors = []
      if (failed.length) errors.push(t('plusStartAllFailed', { names: failed.join(', ') }))
      if (missing.length) errors.push(t('plusModeMissing', { names: missing.join(', ') }))
      if (errors.length) setError(errors.join(' '))
      else setMessage(t(targets.some(device => device.platform === 'ios') ? 'plusAirplayHint' : 'plusMirrorStarted'))
      setSessions(await main.getMirrorSessions())
      if (failed.length < targets.length) await main.applyMirrorLayout({ layout: layoutMode, deviceKeys: targets.map(mirrorDeviceKey) })
    } catch { setError(t('plusStartFailed')) }
    finally { setBusy(false) }
  }
  async function stop(id: string) {
    setBusy(true); setError('')
    try { await main.stopMirrorSession(id); setSessions(await main.getMirrorSessions()) }
    catch { setError(t('plusStopFailed')) }
    finally { setBusy(false) }
  }
  async function applyLayout(layout: MirrorLayout = layoutMode) {
    if (busy) return
    setLayoutMode(layout); setBusy(true); setError('')
    const selectedKey = store.mirrorTarget?.key
    try {
      await store.refreshTargets()
      const targets = targetsForMode(store.targets, startMode, selectedKey)
      if (!targets.length) { setError(t('plusLayoutFailed')); return }
      await main.applyMirrorLayout({ layout, deviceKeys: targets.map(mirrorDeviceKey) })
    } catch { setError(t('plusLayoutFailed')) }
    finally { setBusy(false) }
  }
  return <div className={Style.page}>
    <header><h1>{t('plusDevices')}</h1><p>{t('plusDevicesHint')}</p></header>
    <div className={Style.modes}>
      <label className={Style.picker}>{t('plusStartMode')}
        <select data-start-mode value={startMode} disabled={busy} onChange={event => setStartMode(event.target.value as StartMode)}>
          <option value="single">{t('plusModeSingle')}</option>
          <option value="android-harmony">{t('plusModeAndroidHarmony')}</option>
          <option value="all">{t('plusModeAll')}</option>
        </select>
      </label>
      <label className={Style.picker}>{t('plusLayoutMode')}
        <select data-layout-mode value={layoutMode} disabled={busy} onChange={event => setLayoutMode(event.target.value as MirrorLayout)}>
          <option value="independent">{t('plusLayoutIndependent')}</option>
          <option value="side-by-side">{t('plusArrangeMirrors')}</option>
          <option value="merged">{t('plusMergeMirrors')}</option>
        </select>
      </label>
    </div>
    <label className={Style.picker}>{t('plusSelectMirrorDevice')}
      <select data-device-picker aria-label={t('plusSelectMirrorDevice')} disabled={busy || startMode !== 'single'} value={target?.key || ''} onChange={event => store.selectMirrorTarget(event.target.value)}>
        {!store.targets.length && <option value="">{t('targetNotConnected')}</option>}
        {store.targets.map(device => <option key={device.key} value={device.key}>
          {device.transport === 'receiver' ? t('plusAirplayReceiver') : `${device.platform || 'harmony'} · ${device.name}`}
        </option>)}
      </select>
    </label>
    <p className={Style.modeHint}>{t('plusIndependentSelection')}</p>
    <p className={Style.modeHint}>{t('plusModeScope')}</p>
    <div className={Style.actions}>
      <button type="button" data-action="start-mode" disabled={busy} onClick={() => void start()}>{t('plusStartModeAction')}</button>
      <button type="button" data-action="apply-layout" disabled={busy || !sessions.length} onClick={() => void applyLayout()}>{t('plusApplyLayout')}</button>
      <button type="button" disabled={busy || !sessions.length} onClick={() => void applyLayout('side-by-side')}>{t('plusArrangeMirrors')}</button>
      <button type="button" disabled={busy || !sessions.length} onClick={() => void applyLayout('merged')}>{t('plusMergeMirrors')}</button>
    </div>
    {!!store.discoveryErrors.length && <p role="status">{t('plusDiscoveryWarning', { backends: store.discoveryErrors.join(', ') })}</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {startMode === 'single' && <section className={Style.card}>
      <h2>{target?.transport === 'receiver' ? t('plusAirplayReceiver') : target?.name || t('targetNotConnected')}</h2>
      <p>{target?.platform === 'ios' ? t('plusAirplayHint') : t('plusControlHint')}</p>
      <p>{target?.platform === 'ios' ? t('plusViewOnly') : t('plusControlSupported')}</p>
      {target?.state === 'unauthorized' && <p>{t('plusAuthorizeHint')}</p>}
      {target?.state === 'unavailable' && <p>{t('plusMetadataHint')}</p>}
      {target?.state === 'offline' && <p>{t('plusOfflineHint')}</p>}
      <button type="button" data-action="start-selected" disabled={busy || !target || target.state === 'offline' || target.state === 'unavailable' || (target.state === 'unauthorized' && target.platform !== 'ios')}
        onClick={() => void start()}>{t(target?.platform === 'ios' ? 'plusStartReceiver' : 'workspaceStartMirroring')}</button>
    </section>}
    <section className={Style.card}>
      <h2>{t('plusSessions')}</h2>
      {!sessions.length && <p>{t('plusNoSessions')}</p>}
      {sessions.map(session => <div className={Style.session} key={session.id}>
        <span><strong>{session.name}</strong><small>{session.platform} · {sessionStatus(session.state)}</small>
          {session.platform === 'ios' && <small>{t('plusReceiverUnassociated')}</small>}</span>
        <button type="button" disabled={busy || session.state === 'stopping'} onClick={() => void stop(session.id)}>{t('stop')}</button>
      </div>)}
    </section>
  </div>
})
