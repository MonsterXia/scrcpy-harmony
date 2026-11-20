import className from 'licia/className'

interface IProps {
  icon: string
  className?: string
  title: string
  pressed?: boolean
  disabled?: boolean
  state?: '' | 'hover' | 'active'
  onClick: () => void
}

export default function ToolbarIcon(props: IProps) {
  return (
    <div className={className('luna-toolbar-item luna-toolbar-item-button', props.className, {
      'luna-toolbar-disabled': props.disabled,
    })}>
      <button type="button" disabled={props.disabled} aria-label={props.title} aria-pressed={props.pressed} title={props.title}
        className={props.state ? `luna-toolbar-${props.state}` : undefined} onClick={props.onClick}>
        <span className="icon toolbar-icon" aria-hidden="true"><span className={`icon-${props.icon}`} /></span>
      </button>
    </div>
  )
}
