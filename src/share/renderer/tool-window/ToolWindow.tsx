import { PropsWithChildren, ReactNode } from 'react'
import Style from './ToolWindow.module.scss'

export default function ToolWindow({
  theme,
  title,
  description,
  actions,
  children,
  className = '',
}: PropsWithChildren<{
  theme: string
  title?: string
  description?: string
  actions?: ReactNode
  className?: string
}>) {
  return (
    <main
      className={`${Style.window} ${className}`}
      data-theme={theme}
      data-tool-window
    >
      {title && (
        <header className={Style.heading}>
          <div>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {actions && <div className={Style.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </main>
  )
}
