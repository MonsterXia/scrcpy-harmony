import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import type { IosSetupAction, IosSetupState } from 'common/iosProvisioning'
import { t } from 'common/util'
import { Dialog, DialogFooter } from 'share/renderer/dialog/Dialog'
import Style from './App.module.scss'
import StatusStyle from '../components/MirrorStatus.module.scss'
const phases = {
  idle:() => t('iosSetupIntro'),checking:() => t('iosSetupChecking'),login:() => t('iosSetupLogin'),authenticating:() => t('iosSetupAuthenticating'),
  challenge:() => t('iosSetupChallenge'),team:() => t('iosSetupTeam'),signing:() => t('iosSetupSigning'),installing:() => t('iosSetupInstalling'),
  mounting:() => t('iosSetupMounting'),starting:() => t('iosSetupStarting'),ready:() => t('iosSetupReady'),deferred:() => t('iosSetupDeferred'),error:() => t('iosSetupFailed'),cancelled:() => t('iosSetupCancelled'),
}
const errors: Record<string,() => string> = {
  'status-unknown':() => t('iosSetupUnknown'), 'runner-mismatch':() => t('iosSetupUnknown'),
  'auth-required':() => t('iosSetupAuthRequired'),'team-unavailable':() => t('iosSetupTeamUnavailable'),'no-team':() => t('iosSetupNoTeam'),
  'certificate-limit':() => t('iosSetupCertificateLimit'),'keychain-unavailable':() => t('iosSetupKeychain'),
  'developer-mode':() => t('iosSetupDeveloperMode'),'developer-trust':() => t('iosSetupDeveloperTrust'),'device-locked':() => t('iosSetupUnlock'),
  'trust-computer':() => t('iosSetupTrustComputer'),'helper-unavailable':() => t('iosSetupHelperMissing'),'busy':() => t('iosSetupDeferred'),
}
export default observer(function IosSetup({ onReady, onClose }: { onReady: () => void; onClose: () => void }) {
  const [state,setState] = useState<IosSetupState>({phase:'idle'})
  const [email,setEmail] = useState(''), [password,setPassword] = useState(''), [code,setCode] = useState('')
  const [consent,setConsent] = useState(false), [working,setWorking] = useState(false)
  const active = useRef(true), completed = useRef(false)
  const receive = (next: IosSetupState) => { if (active.current) setState(next) }
  useEffect(() => {
    active.current = true
    const poll = () => void main.iosSetup({action:'status'}).then(receive).catch(() => receive({phase:'error',error:'helper-unavailable'}))
    poll(); const timer=setInterval(poll,1000)
    return () => { active.current=false;clearInterval(timer) }
  },[])
  async function send(action: IosSetupAction) {
    const challenge = ['code','sms','devices','resend'].includes(action.action)
    if (!challenge) setWorking(true)
    if (action.action === 'login') setState(current => ({ ...current, phase: 'authenticating', error: undefined }))
    try {
      const next=await main.iosSetup(action);receive(next)
      if (next.phase==='ready' && ['login','team','prepare'].includes(action.action) && !completed.current) {completed.current=true;onReady()}
    } catch { receive({phase:'error',error:'device-error'}) }
    finally { if (active.current && !challenge) setWorking(false) }
  }
  const pending=['checking','authenticating','challenge','signing','installing','mounting','starting'].includes(state.phase)
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
      <button type="button" onClick={pending ? () => void send({action:'cancel'}) : onClose}>
        {pending ? t('cancel') : t('close')}
      </button>
    </DialogFooter>}>
    <p role="status">{phases[state.phase]()}</p>
    {state.error && <p role="alert">{(errors[state.error] || (() => t('iosSetupGenericError')))()}</p>}
    {state.expiresAt && <p>{t('iosSetupExpires')}: {new Date(state.expiresAt).toLocaleString()}</p>}
    {showLogin && <form onSubmit={event => {event.preventDefault();const secret=password;setPassword('');void send({action:'login',email,password:secret})}}>
      <label>{t('iosSetupAppleId')}<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} /></label>
      <label>{t('iosSetupPassword')}<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={4096} /></label>
      <p className={Style.setupHelp}>{t('iosSetupAuthNotice')}</p>
      <label className={Style.setupConsent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />{t('iosSetupConsent')}</label>
      <button type="submit" disabled={working || !consent} className={StatusStyle.retryButton}>{t('iosSetupSignIn')}</button>
    </form>}
    {state.phase==='challenge' && <form onSubmit={event=>{event.preventDefault();void send({action:'code',code});setCode('')}}>
      <label>{t('iosSetupCode')}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} required /></label>
      <button type="submit" className={StatusStyle.retryButton}>{t('iosSetupVerify')}</button>
      <div className={Style.setupLinks}>
        <button type="button" onClick={()=>void send({action:'devices'})}>{t('iosSetupSendDevices')}</button>
        <button type="button" onClick={()=>void send({action:'resend'})}>{t('iosSetupResend')}</button>
        {state.challenge?.numbers.map(n=><button key={n.id} type="button" onClick={()=>void send({action:'sms',numberId:n.id})}>{t('iosSetupSms')} ••{n.lastTwoDigits}</button>)}
      </div>
    </form>}
    {state.authenticated && !pending && !showLogin && <>
      {state.phase==='team' ? <div className={Style.setupLinks}>{state.teams?.map(team=><button disabled={working} key={team.id} onClick={()=>void send({action:'team',teamId:team.id})}>{team.name || team.kind || team.id}</button>)}</div> :
        <button disabled={working} className={StatusStyle.retryButton} onClick={()=>void send({action:'prepare'})}>{t('iosSetupPrepare')}</button>}
      <p className={Style.setupHelp}>{t('iosSetupRenewal')}</p>
    </>}
    <details className={StatusStyle.setupDetails}><summary>{t('plusIosSetupChecklist')}</summary><ol><li>{t('plusIosSetupTrust')}</li><li>{t('plusIosSetupDeveloper')}</li><li>{t('iosSetupDeveloperTrust')}</li></ol></details>

  </Dialog>
})
