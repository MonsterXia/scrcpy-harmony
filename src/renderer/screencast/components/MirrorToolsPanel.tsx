import type { ReactNode, SelectHTMLAttributes } from 'react'
import LunaToolbar, { LunaToolbarSpace } from 'luna-toolbar/react'
import Style from './Toolbar.module.scss'

interface Props {
  id: string
  expanded: boolean
  children: ReactNode
  footer: ReactNode
}

export default function MirrorToolsPanel({ id, expanded, children, footer }: Props) {
  return (
    <div id={id} className={Style.panel} data-visible={expanded}
      aria-hidden={!expanded} inert={!expanded}>
      <LunaToolbar className={Style.container}>
        {children}
        <LunaToolbarSpace />
        <div className={Style.details}>{footer}</div>
      </LunaToolbar>
    </div>
  )
}

export function MirrorToolsSelect({ label, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return <label className={Style.resolution}>
    {label}
    <select {...props} />
  </label>
}
