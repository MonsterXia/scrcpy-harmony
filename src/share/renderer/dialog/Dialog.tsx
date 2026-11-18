import {
  useEffect,
  useId,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import Style from './Dialog.module.scss'

/** Drawers and confirmations are scoped to their workspace or enclosing dialog. */
export function Dialog({
  title,
  children,
  visible = true,
  size = 'normal',
  closeLabel,
  onDismiss,
  footer,
  descriptionId,
  alert,
  suspended,
  restoreFocus,
  contentClassName,
}: PropsWithChildren<{
  title: string
  visible?: boolean
  size?: 'compact' | 'normal' | 'wide' | 'drawer'
  closeLabel?: string
  onDismiss?: () => void
  footer?: ReactNode
  descriptionId?: string
  alert?: boolean
  suspended?: boolean
  restoreFocus?: () => void
  contentClassName?: string
}>) {
  const ref = useRef<HTMLDialogElement>(null)
  const restore = useRef(restoreFocus)
  restore.current = restoreFocus
  const titleId = useId()
  const local = size === 'drawer' || alert
  useEffect(() => {
    const node = ref.current
    if (!node || !visible) return
    const opener = document.activeElement as HTMLElement | null
    if (!local) node.showModal()
    const initial = node.querySelector<HTMLElement>(
      '[data-dialog-close], [data-confirm-cancel]',
    )
    initial?.focus()
    return () => {
      if (!local) node.close()
      if (restore.current) restore.current()
      else if (opener?.isConnected && !opener.closest('[inert]')) {
        if (opener.matches(':disabled'))
          opener
            .closest('dialog')
            ?.querySelector<HTMLElement>('button:not(:disabled)')
            ?.focus()
        else opener.focus()
      }
    }
  }, [visible, local])

  const panel = (
    <dialog
      ref={ref}
      open={local ? visible : undefined}
      className={Style.dialog}
      data-size={size}
      role={alert ? 'alertdialog' : 'dialog'}
      aria-modal={!suspended || undefined}
      aria-hidden={suspended || undefined}
      inert={suspended}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDismiss?.()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss?.()
      }}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          (event.target as Element).closest('dialog') !== ref.current
        )
          return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onDismiss?.()
        } else if (event.key === 'Tab') {
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
            ),
          ).filter(
            (el) =>
              el.closest('dialog') === ref.current &&
              !el.closest('[inert], [hidden]') &&
              !el.matches(
                'details:not([open]) > :not(summary), details:not([open]) > :not(summary) *',
              ),
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
        }
      }}
    >
      <div className={Style.surface}>
        <div className={Style.heading}>
          <h2 id={titleId}>{title}</h2>
          {closeLabel && (
            <button
              type="button"
              data-dialog-close
              aria-label={closeLabel}
              title={closeLabel}
              onClick={onDismiss}
            >
              ×
            </button>
          )}
        </div>
        <div
          className={[Style.body, contentClassName].filter(Boolean).join(' ')}
          role={alert ? 'region' : undefined}
          aria-labelledby={alert ? titleId : undefined}
          tabIndex={alert ? 0 : undefined}
        >
          {children}
        </div>
        {footer}
      </div>
    </dialog>
  )
  if (!local) return panel
  if (!visible) return null
  return (
    <div
      className={Style.overlay}
      data-drawer={size === 'drawer'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss?.()
      }}
    >
      {panel}
    </div>
  )
}

export function DialogFooter({
  children,
  secondary,
  className = '',
}: PropsWithChildren<{
  secondary?: ReactNode
  className?: string
}>) {
  return (
    <footer className={Style.footer + ' ' + className}>
      {secondary}
      {children}
    </footer>
  )
}
