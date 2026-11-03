import { t } from 'common/util'
import Style from './BundleInfoModal.module.scss'

export type BundleAction =
  'open' | 'stop' | 'cleanCache' | 'cleanData' | 'uninstall'

export default function ApplicationActions({
  busy,
  canOpen,
  onAction,
}: {
  busy: boolean
  canOpen: boolean
  onAction: (action: BundleAction) => void
}) {
  return (
    <div className={Style.actions} aria-busy={busy}>
      <button
        type="button"
        className={Style.primary}
        disabled={busy || !canOpen}
        onClick={() => onAction('open')}
      >
        <span className="icon-play" aria-hidden="true" />
        {t('open')}
      </button>
      <button type="button" disabled={busy} onClick={() => onAction('stop')}>
        {t('stop')}
      </button>
      <div className={Style.maintenance}>{t('applicationMaintenance')}</div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onAction('cleanCache')}
      >
        {t('cleanCache')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onAction('cleanData')}
      >
        {t('cleanData')}
      </button>
      <button
        type="button"
        className={Style.danger}
        disabled={busy}
        onClick={() => onAction('uninstall')}
      >
        {t('uninstall')}
      </button>
    </div>
  )
}
