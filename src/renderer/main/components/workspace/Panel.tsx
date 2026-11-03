import { PropsWithChildren, useState } from 'react'
import Style from './Panel.module.scss'

export default function Panel({
  id,
  active,
  children,
}: PropsWithChildren<{ id: string; active: boolean }>) {
  const [visited, setVisited] = useState(active)
  if (active && !visited) setVisited(true)

  return (
    <section
      id={`panel-${id}`}
      className={Style.panel}
      data-panel={id}
      inert={!active}
      aria-hidden={!active}
      style={{ visibility: active ? 'visible' : 'hidden' }}
    >
      {visited || active ? children : null}
    </section>
  )
}
