import { t } from 'common/util'
import Style from './App.module.scss'

export function StatusIcon({ busy = false }: { busy?: boolean }) {
  return <span className={Style.statusIcon} data-busy={busy} aria-hidden="true">
    {busy ? <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-8-8" /></svg> :
      <svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10 5h4M11 18.5h2M12 9v4M12 15.5v.1" /></svg>}
  </span>
}

export default function StatusCard({ title, description, busy, setup, onRetry }: {
  title: string
  description: string
  busy: boolean
  setup: boolean
  onRetry?: () => void
}) {
  return <section className={Style.statusCard} role={onRetry ? 'alert' : 'status'} aria-labelledby="mirror-status-title">
    <div className={Style.statusHeading}>
      <StatusIcon busy={busy} />
      <h2 id="mirror-status-title">{title}</h2>
    </div>
    <p className={Style.statusDescription}>{description}</p>
    {setup && <details className={Style.setupDetails}>
      <summary>{t('plusIosSetupChecklist')}</summary>
      <ol>
        <li>{t('plusIosSetupTrust')}</li>
        <li>{t('plusIosSetupDeveloper')}</li>
        <li>{t('plusIosSetupRunner')}</li>
      </ol>
    </details>}
    {onRetry && <div className={Style.statusActions}>
      <button className={Style.retryButton} type="button" onClick={onRetry}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 7a6.5 6.5 0 1 0 .4 5M16 3v4h-4" /></svg>
        {t('retry')}
      </button>
    </div>}
  </section>
}
