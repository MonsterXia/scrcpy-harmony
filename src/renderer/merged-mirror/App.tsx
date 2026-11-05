import { useEffect, useState } from 'react'
import type { MergedMirrorFrame, MirrorPlatform } from 'common/types'
import Style from './App.module.scss'

const systems: Array<{ platform: MirrorPlatform; name: string }> = [
  { platform: 'android', name: 'Android' },
  { platform: 'harmony', name: 'HarmonyOS' },
  { platform: 'ios', name: 'iOS' },
]

export default function App() {
  const [frames, setFrames] = useState<MergedMirrorFrame[]>([])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try { const value = await main.getMergedMirrorFrames(); if (active) setFrames(value) }
      catch { /* Keep the last completed pictures during a transient IPC failure. */ }
      if (active) timer = setTimeout(() => void refresh(), 66)
    }
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [])
  const included = systems.flatMap(system => frames.filter(frame => frame.platform === system.platform).map(frame => ({ ...system, frame })))
  return <main className={Style.page} style={{ gridTemplateColumns: `repeat(${Math.max(1, included.length)}, minmax(0, 1fr))` }}>
    {included.map(({ platform, name, frame }) => {
      return <section key={frame.sourceId ?? platform} className={Style.column} data-platform={platform} data-source={frame.sourceId}>
        <h1>{name}</h1>
        <div className={Style.picture}>{frame?.image && <img src={frame.image} alt={name} draggable={false} />}</div>
      </section>
    })}
  </main>
}
