import { observer } from 'mobx-react-lite'
import { Dialog } from 'share/renderer/dialog/Dialog'
import { t } from 'common/util'
import Style from './BundleInfoModal.module.scss'
import defaultIcon from '../../../assets/default-icon.png'
import { IModalProps } from 'share/common/types'
import { IBundleInfo } from 'common/types'
import dateFormat from 'licia/dateFormat'
import copy from 'licia/copy'
import { notify } from 'share/renderer/lib/util'
import ApplicationActions, { BundleAction } from './ApplicationActions'

interface IProps extends IModalProps {
  bundleInfo: IBundleInfo
  busy: boolean
  returnFocus?: HTMLElement | null
  restoreFocus?: () => void
  suspended?: boolean
  onAction: (action: BundleAction) => void
}

// Kept under the historical filename so existing callers keep their interface.
// The details surface stays inside the workspace's theme and device boundary.
export default observer(function BundleInfoModal({
  bundleInfo,
  visible,
  onClose,
  busy,
  onAction,
  returnFocus,
  restoreFocus,
  suspended = false,
}: IProps) {
  if (!visible) return null
  function item(title: string, value: string | number) {
    const text = String(value ?? '')
    return (
      <div className={Style.item} key={title}>
        <dt>{title}</dt>
        <dd>
          <button
            type="button"
            disabled={!text}
            title={t('workspaceCopyValue', { name: title, value: text })}
            onClick={() => {
              copy(text)
              notify(t('copied'), { icon: 'info' })
            }}
          >
            {text || t('unknown')}
          </button>
        </dd>
      </div>
    )
  }
  return (
    <Dialog
      size="drawer"
      title={t('bundleInfo')}
      closeLabel={t('close')}
      onDismiss={onClose}
      suspended={suspended}
      restoreFocus={
        restoreFocus || (returnFocus ? () => returnFocus.focus() : undefined)
      }
    >
      <div className={Style.header}>
        <img
          src={bundleInfo.icon || defaultIcon}
          alt=""
          onError={(event) => {
            if (event.currentTarget.getAttribute('src') !== defaultIcon)
              event.currentTarget.src = defaultIcon
          }}
        />
        <div className={Style.basic}>
          <h3>{bundleInfo.label}</h3>
          <span>{bundleInfo.versionName}</span>
        </div>
      </div>
      <dl>
        {item(t('bundleName'), bundleInfo.bundleName)}
        {item(t('version'), bundleInfo.versionName)}
        {item(t('sysBundle'), bundleInfo.system ? t('yes') : t('no'))}
        {item(t('apiTargetVersion'), bundleInfo.apiTargetVersion)}
        {bundleInfo.vendor && item(t('vendor'), bundleInfo.vendor)}
        {item(
          t('installTime'),
          dateFormat(new Date(bundleInfo.installTime), 'yyyy-mm-dd HH:MM:ss'),
        )}
        {item(t('releaseType'), bundleInfo.releaseType)}
        {bundleInfo.mainAbility &&
          item(t('mainAbility'), bundleInfo.mainAbility)}
      </dl>
      <ApplicationActions
        busy={busy}
        canOpen={Boolean(bundleInfo.mainAbility)}
        onAction={onAction}
      />
    </Dialog>
  )
})
