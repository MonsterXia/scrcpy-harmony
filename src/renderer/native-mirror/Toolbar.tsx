import { observer } from 'mobx-react-lite'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import { t } from 'common/util'
import type { MirrorSession } from 'common/types'
import FloatingStyle from '../screencast/components/Toolbar.module.scss'
import MirrorToolsPanel, { MirrorToolsSelect } from '../screencast/components/MirrorToolsPanel'
import ToolbarToggle from '../screencast/components/ToolbarToggle'
import Style from './App.module.scss'

interface Props {
  mode: MirrorSession['videoMode']
  busy: boolean
  connected: boolean
  onVideo: (enabled: boolean) => void
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
    onPointerDownCapture={event => { keyboardInteraction.current = false; setFocused((event.target as HTMLElement).matches('select')) }}
    onFocusCapture={event => setFocused(keyboardInteraction.current || event.target.matches('select'))}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget) && !toggle.current?.contains(event.relatedTarget)) setFocused(false) }}
    onKeyDown={event => {
      keyboardInteraction.current = true; setFocused(true)
      if (event.key === 'Escape' && expanded) {
        event.preventDefault(); event.stopPropagation(); setExpanded(false); toggle.current?.focus()
      }
    }}>
    {createPortal(<div className={`${FloatingStyle.entry} ${Style.toolEntry}`}>
      <ToolbarToggle ref={toggle} expanded={expanded} visible
        controls="ios-mirror-tools" onClick={() => setExpanded(!expanded)} />
    </div>, document.body)}
    <MirrorToolsPanel id="ios-mirror-tools" expanded={expanded} footer={<>
      <span className={FloatingStyle.status} role="status"
        title={t(mode === 'video' ? 'plusIosVideoMode' : 'plusIosScreenshotMode')}>
        {transitioning ? t('plusSessionStarting') : mode === 'video' ? 'ReplayKit' : 'WDA'}
      </span>
      <MirrorToolsSelect label={t('plusIosMirrorMode')} disabled={transitioning || !connected}
        value={mode === 'video-starting' ? 'video' : mode || 'screenshot'}
        onChange={event => {
          onVideo(event.currentTarget.value === 'video')
          if (!keyboardInteraction.current) setFocused(false)
        }}>
        {mode === 'video-error' && <option value="video-error" disabled>{t('plusIosChooseMode')}</option>}
        <option value="video">{t('plusIosVideoOption')}</option>
        <option value="screenshot">{t('plusIosScreenshotOption')}</option>
      </MirrorToolsSelect>
      {mode === 'video-error' && <p className={FloatingStyle.modeHint} role="alert">{t('plusIosVideoFailed')}</p>}
      {mode === 'screenshot' && <p className={FloatingStyle.modeHint}>{t('plusIosBroadcastHint')}</p>}
    </>}>
      <ToolbarIcon icon="circle" title={t('plusIosHome')} disabled={transitioning || !connected} onClick={onHome} />
      <ToolbarIcon icon="setting" title={t('iosSetupTitle')} onClick={() => {
        toggle.current?.focus()
        setExpanded(false)
        onSetup()
      }} />
    </MirrorToolsPanel>
  </div>
})
