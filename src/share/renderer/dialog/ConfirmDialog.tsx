import { useId } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from '../../common/i18n'
import { Dialog, DialogFooter } from './Dialog'

export interface ConfirmDialogProps {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default observer(function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const messageId = useId()
  if (!visible) return null
  return (
    <Dialog
      alert
      title={title}
      descriptionId={messageId}
      onDismiss={onCancel}
      footer={
        <DialogFooter>
          <button type="button" data-confirm-cancel onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            type="button"
            data-tone="danger"
            data-confirm-accept
            onClick={onConfirm}
          >
            {confirmLabel || t('ok')}
          </button>
        </DialogFooter>
      }
    >
      <p id={messageId}>{message}</p>
    </Dialog>
  )
})
