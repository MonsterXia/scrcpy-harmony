import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import type { IosSetupAction, IosSetupState } from 'common/iosProvisioning'
import { t } from 'common/util'
import { Dialog, DialogFooter } from 'share/renderer/dialog/Dialog'
import Style from './App.module.scss'
import StatusStyle from '../components/MirrorStatus.module.scss'
const phases = {
  verifying:() => t('iosSetupVerifying'),sending:() => t('iosSetupSending'),
  idle:() => t('iosSetupIntro'),checking:() => t('iosSetupChecking'),login:() => t('iosSetupLogin'),authenticating:() => t('iosSetupAuthenticating'),
  challenge:() => t('iosSetupChallenge'),team:() => t('iosSetupTeam'),signing:() => t('iosSetupSigning'),installing:() => t('iosSetupInstalling'),
  mounting:() => t('iosSetupMounting'),starting:() => t('iosSetupStarting'),ready:() => t('iosSetupReady'),deferred:() => t('iosSetupDeferred'),error:() => t('iosSetupFailed'),cancelled:() => t('iosSetupCancelled'),
}
const errors: Record<string,() => string> = {
  'start-timeout':() => t('iosSetupRunnerNotReady'),
  'launch-failed':() => t('iosSetupLaunchFailed'),
  'invalid-credentials':() => t('iosSetupInvalidCredentials'), 'invalid-code':() => t('iosSetupInvalidCode'),
  'delivery-failed':() => t('iosSetupDeliveryFailed'), 'timeout':() => t('iosSetupTimeout'),
  'status-unknown':() => t('iosSetupUnknown'), 'runner-mismatch':() => t('iosSetupUnknown'),
  'auth-required':() => t('iosSetupAuthRequired'),'team-unavailable':() => t('iosSetupTeamUnavailable'),'no-team':() => t('iosSetupNoTeam'),
  'certificate-limit':() => t('iosSetupCertificateLimit'),'keychain-unavailable':() => t('iosSetupKeychain'),
  'developer-mode':() => t('iosSetupDeveloperMode'),'developer-trust':() => t('iosSetupLaunchDenied'),'device-locked':() => t('iosSetupUnlock'),
  'trust-computer':() => t('iosSetupTrustComputer'),'helper-unavailable':() => t('iosSetupHelperMissing'),'busy':() => t('iosSetupDeferred'),
}
export default observer(function IosSetup({ onReady, onClose }: { onReady: () => void; onClose: () => void }) {
  const [state,setState] = useState<IosSetupState>({phase:'idle'})
  const [email,setEmail] = useState(''), [password,setPassword] = useState(''), [code,setCode] = useState('')
  const [consent,setConsent] = useState(false), [working,setWorking] = useState(false)
  const active = useRef(true), completed = useRef(false), revision = useRef(0)
  const actionGeneration = useRef(0)
  const receive = (next: IosSetupState) => { if (active.current) setState(next) }
  useEffect(() => {
    active.current = true
    let polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      const observed = revision.current
      try { const next = await main.iosSetup({action:'status'}); if (observed === revision.current) receive(next) }
      catch { if (observed === revision.current) receive({phase:'error',error:'helper-unavailable'}) }
      finally { polling = false }
    }
    poll(); const timer=setInterval(poll,1000)
    return () => { active.current=false;revision.current++;clearInterval(timer) }
  },[])
  async function send(action: IosSetupAction) {
    const challenge = ['code','sms','devices','resend'].includes(action.action)
    const generation = challenge ? actionGeneration.current : ++actionGeneration.current
    revision.current++
    if (challenge) {
      setCode('')
      setState({phase:action.action === 'code' ? 'verifying' : 'sending'})
    }
    if (!challenge) setWorking(true)
    if (action.action === 'login') setState(current => ({ ...current, phase: 'authenticating', error: undefined }))
    try {
      const next=await main.iosSetup(action)
      if (generation !== actionGeneration.current) return
      revision.current++;receive(next)
      if (active.current && next.phase==='ready' && ['login','team','prepare'].includes(action.action) && !completed.current) {completed.current=true;onReady()}
    } catch { if (generation === actionGeneration.current) { revision.current++;receive({phase:'error',error:'device-error'}) } }
    finally { if (active.current && !challenge && generation === actionGeneration.current) setWorking(false) }
  }
  const pending=working || ['checking','authenticating','verifying','sending','challenge','signing','installing','mounting','starting'].includes(state.phase)
  const showLogin=!pending && (!state.authenticated || state.phase==='login')
  return <Dialog title={t('iosSetupTitle')} size="compact" contentClassName={Style.setupCard}
    onDismiss={pending ? undefined : onClose} footer={<DialogFooter secondary={!pending && state.authenticated && <details className={Style.accountDetails}>
        <summary>{t('iosSetupManageAccount')}</summary>
        <div className={Style.accountActions} role="group" aria-describedby="ios-setup-credentials">
          <button type="button" disabled={working} onClick={() => void send({action:'reauthorize'})}>{t('iosSetupReauthorize')}</button>
          <button type="button" disabled={working} onClick={() => void send({action:'logout'})}>{t('iosSetupSignOut')}</button>
        </div>
        <p id="ios-setup-credentials">{t('iosSetupKeepCredentials')}</p>
      </details>}>
      {!pending && !showLogin && state.authenticated && state.phase !== 'team' &&
        <button type="button" data-tone="primary" disabled={working} onClick={()=>void send({action:'prepare'})}>{t('iosSetupPrepare')}</button>}
      <button type="button" onClick={pending ? () => void send({action:'cancel'}) : onClose}>
        {pending ? t('cancel') : t('close')}
      </button>
    </DialogFooter>}>
    <p role="status" className={pending && state.phase !== 'challenge' ? Style.setupProgress : undefined}>{state.phase === 'challenge' && state.challenge?.unknown ? t('iosSetupChooseDelivery') : phases[state.phase]()}</p>
    {state.error && <p role="alert" id="ios-setup-error" className={Style.setupError}>{(errors[state.error] || (() => t('iosSetupGenericError')))()}</p>}
    {state.expiresAt && <p>{t('iosSetupExpires')}: {new Date(state.expiresAt).toLocaleString()}</p>}
    {showLogin && <form onSubmit={event => {event.preventDefault();const secret=password;setPassword('');void send({action:'login',email,password:secret})}}>
      <label>{t('iosSetupAppleId')}<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} /></label>
      <label>{t('iosSetupPassword')}<input type="password" autoComplete="off" aria-describedby={state.error ? 'ios-setup-error' : undefined} aria-invalid={state.error === 'invalid-credentials' || undefined} value={password} onChange={e=>setPassword(e.target.value)} required maxLength={4096} /></label>
      <p className={Style.setupHelp}>{t('iosSetupAuthNotice')}</p>
      <label className={Style.setupConsent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />{t('iosSetupConsent')}</label>
      <button type="submit" disabled={working || !consent} className={StatusStyle.retryButton}>{t('iosSetupSignIn')}</button>
    </form>}
    {state.phase==='challenge' && <form className={Style.challengeForm} onSubmit={event=>{event.preventDefault();if (!state.challenge?.unknown && code.length === 6) void send({action:'code',code})}}>
      {!state.challenge?.unknown && <>
        <label>{t('iosSetupCode')}<input autoFocus className={Style.codeInput} inputMode="numeric" autoComplete="one-time-code" placeholder="······" pattern="[0-9]{6}" value={code} aria-invalid={state.error === 'invalid-code' || undefined} aria-describedby={state.error ? 'ios-setup-error' : undefined} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} required /></label>
        <button type="submit" disabled={code.length !== 6} className={StatusStyle.retryButton}>{t('iosSetupVerify')}</button>
      </>}
      <details className={Style.deliveryOptions} open={state.challenge?.unknown || undefined}>
        <summary>{t('iosSetupDeliveryOptions')}</summary>
        {!state.challenge?.unknown && <button type="button" onClick={()=>void send({action:'resend'})}>{t('iosSetupResend')}</button>}
        {(state.challenge?.sms || state.challenge?.unknown) && <button type="button" onClick={()=>void send({action:'devices'})}>{t('iosSetupSendDevices')}</button>}
        {state.challenge?.numbers.filter(number=>number.id !== state.challenge?.selectedNumberId).map(number=><button key={number.id} type="button" onClick={()=>void send({action:'sms',numberId:number.id})}>{t('iosSetupSms')} ••{number.lastTwoDigits}</button>)}
      </details>
    </form>}
    {state.authenticated && !pending && !showLogin && <>
      {state.phase==='team' && <div className={Style.setupLinks}>{state.teams?.map(team=><button disabled={working} key={team.id} onClick={()=>void send({action:'team',teamId:team.id})}>{team.name || team.kind || team.id}</button>)}</div>}
      <p className={Style.setupHelp}>{t('iosSetupRenewal')}</p>
    </>}
    <details className={StatusStyle.setupDetails}><summary>{t('plusIosSetupChecklist')}</summary><ol><li>{t('plusIosSetupTrust')}</li><li>{t('plusIosSetupDeveloper')}</li><li>{t('iosSetupDeveloperTrust')}</li></ol></details>

  </Dialog>
})
