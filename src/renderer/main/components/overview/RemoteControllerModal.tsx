import { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import { IModalProps } from 'share/common/types'
import { notify } from 'share/renderer/lib/util'
import WorkspaceDialog from '../workspace/WorkspaceDialog'
import Style from './RemoteControllerModal.module.scss'
import store from '../../store'

export default observer(function RemoteControllerModal(props: IModalProps) {
  const [busy, setBusy] = useState(false)
  const session = useRef({ active: false, pending: false })
  const connectKey = store.target?.key
  useEffect(() => {
    const current = { active: props.visible, pending: false }
    session.current = current
    setBusy(false)
    return () => {
      current.active = false
    }
  }, [props.visible, connectKey])
  async function inputKey(code: number) {
    const current = session.current
    if (!current.active || !connectKey || current.pending) return
    const valid = () =>
      current.active &&
      session.current === current &&
      store.target?.key === connectKey
    current.pending = true
    setBusy(true)
    try {
      await main.inputKey(connectKey, code)
    } catch {
      if (valid()) notify(t('commonErr'), { icon: 'error' })
    } finally {
      current.pending = false
      if (valid()) setBusy(false)
    }
  }
  const button = (code: number, label: string, icon?: string) => (
    <button
      type="button"
      key={code}
      data-keycode={code}
      title={label}
      aria-label={label}
      disabled={!connectKey || busy}
      onClick={() => void inputKey(code)}
    >
      {icon ? <span className={`icon-${icon}`} aria-hidden="true" /> : label}
    </button>
  )
  return (
    <WorkspaceDialog
      title={t('remoteController')}
      visible={props.visible}
      onClose={props.onClose}
    >
      <div className={Style.remoteController}>
        <p>{connectKey ? t('workspaceRemoteDialogHint') : t('targetNotConnected')}</p>
        <div className={Style.row}>
          {button(18, t('power'), 'power')}
          {button(17, t('volumeDown'), 'volume-down')}
          {button(16, t('volumeUp'), 'volume')}
        </div>
        <div className={Style.directionPad}>
          <div className={Style.up}>
            {button(2012, t('workspaceDirectionUp'))}
          </div>
          <div className={Style.left}>
            {button(2014, t('workspaceDirectionLeft'))}
          </div>
          <div className={Style.center}>{button(2016, t('ok'))}</div>
          <div className={Style.right}>
            {button(2015, t('workspaceDirectionRight'))}
          </div>
          <div className={Style.down}>
            {button(2013, t('workspaceDirectionDown'))}
          </div>
        </div>
        <div className={Style.row}>
          {button(1, t('home'), 'circle')}
          {button(2, t('back'), 'back')}
          {button(-1, t('appSwitch'), 'square')}
        </div>
      </div>
    </WorkspaceDialog>
  )
})
