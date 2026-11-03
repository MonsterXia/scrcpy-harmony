import { PropsWithChildren, useEffect, useId, useRef } from 'react'
import { t } from 'common/util'
import Style from './WorkspaceDialog.module.scss'

export default function WorkspaceDialog({
  visible,
  title,
  onClose,
  children,
  wide = false,
}: PropsWithChildren<{
  visible: boolean
  title: string
  onClose: () => void
  wide?: boolean
}>) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const node = dialog.current
    if (!node || !visible) return
    const opener = document.activeElement as HTMLElement | null
    node.showModal()
    node.querySelector<HTMLButtonElement>('[data-dialog-close]')?.focus()
    return () => {
      node.close()
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus()
    }
  }, [visible])
  return (
    <dialog
      ref={dialog}
      className={Style.dialog}
      data-wide={wide}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          return
        }
        if (event.key !== 'Tab') return
        const controls = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ) || [],
        ).filter((node) => !node.closest('[inert]'))
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
      <div
        className={Style.surface}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            data-dialog-close
            aria-label={t('close')}
            title={t('close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className={Style.content}>{children}</div>
      </div>
    </dialog>
  )
}
