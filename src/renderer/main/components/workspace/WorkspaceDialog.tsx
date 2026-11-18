import { observer } from 'mobx-react-lite'
import type { PropsWithChildren } from 'react'
import { t } from 'common/util'
import { Dialog } from 'share/renderer/dialog/Dialog'

export default observer(function WorkspaceDialog({
  visible,
  title,
  onClose,
  children,
  wide,
}: PropsWithChildren<{
  visible: boolean
  title: string
  onClose: () => void
  wide?: boolean
}>) {
  return (
    <Dialog
      visible={visible}
      title={title}
      onDismiss={onClose}
      closeLabel={t('close')}
      size={wide ? 'wide' : 'normal'}
    >
      {children}
    </Dialog>
  )
})
