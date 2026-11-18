import { observer } from 'mobx-react-lite'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { t } from 'common/util'
import type { MirrorSession } from 'common/types'
import FloatingStyle from '../screencast/components/Toolbar.module.scss'
import Style from './App.module.scss'

interface Props {
  mode: MirrorSession['videoMode']
  busy: boolean
  connected: boolean
  onVideo: () => void
  onHome: () => void
  onSetup: () => void
}

export default observer(function Toolbar({ mode, busy, connected, onVideo, onHome, onSetup }: Props) {
  const transitioning = busy || mode === 'video-starting'
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const keyboardInteraction = useRef(false)
  useEffect(() => {
    if (!expanded || hovered || focused || busy) return
    const timer = setTimeout(() => setExpanded(false), 2000)
    return () => clearTimeout(timer)
  }, [expanded, hovered, focused, busy])

  return <div className={FloatingStyle.overlay}
    onMouseEnter={() => { setHovered(true) }}
    onMouseLeave={() => setHovered(false)}
    onPointerDownCapture={() => { keyboardInteraction.current = false; setFocused(false) }}
    onFocusCapture={() => { setFocused(keyboardInteraction.current) }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget) && !toggle.current?.contains(event.relatedTarget)) setFocused(false) }}
    onKeyDown={event => {
      keyboardInteraction.current = true; setFocused(true)
      if (event.key === 'Escape' && expanded) {
        event.preventDefault(); event.stopPropagation(); setExpanded(false); toggle.current?.focus()
      }
    }}>
    {createPortal(<div className={`${FloatingStyle.entry} ${Style.toolEntry}`}>
      <button ref={toggle} type="button" className={`${FloatingStyle.toggle} ${Style.toolToggle}`}
        data-visible={true}
        aria-label={t(expanded ? 'hideScreencastTools' : 'showScreencastTools')}
        title={t(expanded ? 'hideScreencastTools' : 'showScreencastTools')}
        aria-expanded={expanded} aria-controls="ios-mirror-tools"
        onClick={() => setExpanded(!expanded)}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          {expanded ? <path d="m5 5 10 10M15 5 5 15" /> : <><path d="M3 6h4m4 0h6M3 14h8m4 0h2" /><circle cx="9" cy="6" r="2" /><circle cx="13" cy="14" r="2" /></>}
        </svg>
      </button>
    </div>, document.body)}
    <div id="ios-mirror-tools" className={`${FloatingStyle.panel} ${Style.toolPanel}`} data-visible={expanded} aria-hidden={!expanded} inert={!expanded}>
      <div className={Style.tools}>
        <button type="button" disabled={transitioning || !connected} onClick={onVideo}>
          {t(transitioning ? 'plusSessionStarting' : mode === 'video' ? 'plusIosStopVideo' : 'plusIosStartVideo')}
        </button>
        <button type="button" disabled={transitioning || !connected} onClick={onHome}>{t('plusIosHome')}</button>
        <button type="button" onClick={() => { setExpanded(false); onSetup() }}>{t('iosSetupTitle')}</button>
        <span className={Style.mode}>{t(transitioning ? 'plusSessionStarting' : mode === 'video' ? 'plusIosVideoMode' : mode === 'video-error' ? 'plusIosVideoFailed' : 'plusIosScreenshotMode')}</span>
        <p className={Style.hint}>{t('plusIosBroadcastHint')}</p>
      </div>
    </div>
  </div>
})
