import type { Ref } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import Style from './Toolbar.module.scss'

interface Props {
  ref: Ref<HTMLButtonElement>
  expanded: boolean
  visible: boolean
  controls: string
  onClick(): void
}

export default observer(function ToolbarToggle({ ref, expanded, visible, controls, onClick }: Props) {
  const label = t(expanded ? 'hideScreencastTools' : 'showScreencastTools')
  return (
    <button ref={ref} type="button" className={Style.toggle} data-visible={visible}
      aria-label={label} title={label} aria-expanded={expanded} aria-controls={controls} onClick={onClick}
      onKeyDown={event => {
        // The titlebar button is portaled after the panel in document order.
        if (!expanded || event.key !== 'Tab' || event.shiftKey) return
        const first = event.currentTarget.ownerDocument.getElementById(controls)
          ?.querySelector<HTMLElement>('button:enabled, select:enabled')
        if (first) {
          event.preventDefault()
          first.focus()
        }
      }}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        {expanded ? <path d="m5 5 10 10M15 5 5 15" /> : <>
          <path d="M3 6h4m4 0h6M3 14h8m4 0h2" />
          <circle cx="9" cy="6" r="2" />
          <circle cx="13" cy="14" r="2" />
        </>}
      </svg>
    </button>
  )
})
