import { useEffect, useId, useRef } from 'react'
import { t } from '../../common/i18n'
import Style from './ToolConfirm.module.scss'

export interface ConfirmDialogProps {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

// A workspace-local confirmation; messages are rendered as text, never HTML.
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const messageId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!visible) return
    const opener = document.activeElement as HTMLElement | null
    dialog.current
      ?.querySelector<HTMLButtonElement>('[data-confirm-cancel]')
      ?.focus()
    return () => {
      if (!opener?.isConnected) return
      if (!(opener as HTMLButtonElement).disabled && !opener.closest('[inert]'))
        opener.focus()
      else
        opener
          .closest('[role="dialog"]')
          ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
          ?.focus()
    }
  }, [visible])
  if (!visible) return null
  return (
    <div
      className={Style.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialog}
        className={Style.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onCancel()
            return
          }
          if (event.key !== 'Tab') return
          const controls = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), [tabindex="0"]',
            ) || [],
          )
          const first = controls[0],
            last = controls.at(-1)
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <div
          className={Style.content}
          role="region"
          aria-labelledby={titleId}
          tabIndex={0}
        >
          <p id={messageId}>{message}</p>
        </div>
        <div className={Style.actions}>
          <button type="button" data-confirm-cancel onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className={Style.confirm}
            data-confirm-accept
            onClick={onConfirm}
          >
            {confirmLabel || t('ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
