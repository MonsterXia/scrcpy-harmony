import { useEffect, useRef } from 'react'
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
  onAction: (action: BundleAction) => void
}

// Kept under the historical filename so existing callers keep their interface.
// The details surface stays inside the workspace's theme and device boundary.
export default function BundleInfoModal({
  bundleInfo,
  visible,
  onClose,
  busy,
  onAction,
  returnFocus,
}: IProps) {
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!visible) return
    const opener = returnFocus || (document.activeElement as HTMLElement | null)
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      if (opener?.isConnected) opener.focus()
    }
  }, [visible, returnFocus])
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
    <div
      className={Style.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        ref={dialog}
        className={Style.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={t('bundleInfo')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
            return
          }
          if (event.key !== 'Tab') return
          const controls = Array.from(
            dialog.current?.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ) || [],
          )
          const first = controls[0],
            last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
      >
        <header className={Style.title}>
          <h2>{t('bundleInfo')}</h2>
          <button
            type="button"
            aria-label={t('close')}
            title={t('close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className={Style.content}>
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
              dateFormat(
                new Date(bundleInfo.installTime),
                'yyyy-mm-dd HH:MM:ss',
              ),
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
        </div>
      </aside>
    </div>
  )
}
