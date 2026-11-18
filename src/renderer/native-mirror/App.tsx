import { observer } from 'mobx-react-lite'
import { AutomationFrameSource } from '../lib/AutomationFrameSource'
import { useEffect, useRef, useState } from 'react'
import type { MirrorSession, NativeMirrorFrame, NativeMirrorInfo, NativeMirrorInput } from 'common/types'
import { t } from 'common/util'
import H264Decoder from '../screencast/lib/H264Decoder'
import Style from './App.module.scss'
import StatusStyle from '../components/MirrorStatus.module.scss'
import Toolbar from './Toolbar'
import IosSetup from './IosSetup'
import StatusCard, { StatusIcon } from '../components/MirrorStatus'
import { NativeInputFlow } from './NativeInputFlow'

function statusLabel(state: string, issue?: MirrorSession['connectionIssue'], wasConnected = false) {
  switch (state) {
    case 'authorizing': return t('plusAuthorizing')
    case 'waiting': return t('plusAirplayHint')
    case 'running': return t('plusNativeConnected')
    case 'disconnected': return t('plusNativeDisconnected')
    case 'error': return t(issue === 'ios-wda-update' ? 'plusIosWdaUpdateRequired' : issue === 'ios-cleanup-unknown' ? 'plusIosCleanupUnknown' : issue === 'ios-wda' ? wasConnected ? 'plusIosWdaLost' : 'plusIosWdaRequired' : issue === 'usb-access' ? 'plusAndroidUsbAccessError' : 'plusNativeError')
    default: return t('plusNativeStarting')
  }
}
export default observer(function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const presented = useRef(false)
  const [info, setInfo] = useState<NativeMirrorInfo>()
  const [status, setStatus] = useState<MirrorSession['state']>('starting')
  const [error, setError] = useState('')
  const [connectionIssue, setConnectionIssue] = useState<MirrorSession['connectionIssue']>()
  const [videoMode, setVideoMode] = useState<MirrorSession['videoMode']>('screenshot')
  const [videoBusy, setVideoBusy] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const inputFlow = useRef<NativeInputFlow | null>(null)
  const invalidateFrames = useRef<((state: 'starting' | 'disconnected' | 'error') => void) | null>(null)
  const createInputFlow = () => new NativeInputFlow(input => main.nativeMirrorInput(input), () => setError('plusNativeInputError'))
  const touching = useRef(false)
  const pointer = useRef<number | null>(null)
  const lastPoint = useRef({ x: 0, y: 0 })
  const android = info?.target.platform === 'android'
  const iosUsb = info?.target.platform === 'ios' && info.target.transport === 'usb'
  const interactive = android || iosUsb
  const display = useRef<{ width: number; height: number; rotation: number } | undefined>(undefined)
  const title = interactive ? info.target.name : t('screencast')
  useEffect(() => preload.setTitle(title), [title])
  useEffect(() => { if (iosUsb && connectionIssue === 'ios-wda' && status === 'error' && !presented.current) setSetupOpen(true) },[iosUsb,connectionIssue,status])
  const send = (input: NativeMirrorInput) => {
    if (iosUsb) {
      if (!display.current && (input.type === 'scroll' || (input.type === 'touch' && ['down','move'].includes(input.action)))) return false
      return inputFlow.current!.send({ ...input, display: display.current })
    }
    void main.nativeMirrorInput(input).catch(() => setError('plusNativeInputError'))
    return true
  }
  useEffect(() => {
    inputFlow.current = createInputFlow()
    const frames = new AutomationFrameSource(main, () => canvas.current)
    let active = true, id: string | undefined, usbInput = false
    let connectionState: MirrorSession['state'] = 'starting'
    let decoder: H264Decoder | undefined
    let hasFrame = false, lastFit = '', format = '', rotation = 0
    let frameTail = Promise.resolve(), generation = 0
    const invalidate = (state: 'starting' | 'disconnected' | 'error') => {
      connectionState = state
      generation++; display.current = undefined; hasFrame = false; format = ''
      decoder?.destroy(); decoder = undefined; frameTail = Promise.resolve()
      frames.reset(state)
    }
    invalidateFrames.current = invalidate
    const fitCanvas = () => {
      const element = canvas.current
      if (!active || !hasFrame || !element) return
      const rect = element.getBoundingClientRect()
      const vertical = Math.max(0, Math.round(window.innerHeight - rect.height))
      const horizontal = Math.max(0, Math.round(window.innerWidth - rect.width))
      const key = `${element.width}:${element.height}:${vertical}:${horizontal}`
      if (key === lastFit) return
      lastFit = key
      void main.nativeMirrorFit(element.width, element.height, vertical, horizontal).catch(() => {})
    }
    // Wrapped status text and platform titlebars change the non-video inset.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fitCanvas)
    if (canvas.current) observer?.observe(canvas.current)
    const createDecoder = () => {
      const epoch = generation
      return new H264Decoder(frame => {
      try {
        const element = canvas.current
        if (!active || epoch !== generation || !element) return
        if (element.width !== frame.displayWidth || element.height !== frame.displayHeight) {
          element.width = frame.displayWidth; element.height = frame.displayHeight
        }
        hasFrame = true; fitCanvas()
        const context = element.getContext('2d')
        if (context) { context.drawImage(frame, 0, 0); presented.current = true; setError(current => current === 'plusNativeDecodeError' ? '' : current); display.current = { width: element.width, height: element.height, rotation }; frames.presented(rotation) }
      } finally { frame.close() }
    }, error => {
      console.error('Native video decode failed', error)
      if (active && epoch === generation) {
        display.current = undefined; frames.reset('error'); setError('plusNativeDecodeError')
        if (usbInput) void main.nativeMirrorVideo(false).catch(() => {})
      }
    })
    }
    const unsubscribeFrame = main.on('nativeMirrorFrame', (packet: NativeMirrorFrame) => {
      if (!active || packet.sessionId !== id) return
      const epoch = generation
      frameTail = frameTail.then(async () => {
        if (!active || epoch !== generation) return
        const nextFormat = packet.format || 'h264'
        if (format !== nextFormat) { display.current = undefined; format = nextFormat; frames.reset(); decoder?.destroy(); decoder = undefined }
        rotation = packet.rotation || 0
        if (packet.format === 'png') {
          const bitmap = await createImageBitmap(new Blob([new Uint8Array(packet.data)], { type: 'image/png' }))
          try {
            const element = canvas.current
            if (!active || epoch !== generation || !element) return
            element.width = bitmap.width; element.height = bitmap.height
            const context = element.getContext('2d')
            if (context) {
              context.drawImage(bitmap, 0, 0); hasFrame = true; fitCanvas()
              presented.current = true; setError(current => current === 'plusNativeDecodeError' ? '' : current)
              display.current = { width: bitmap.width, height: bitmap.height, rotation }
              frames.presented(rotation)
            }
          } finally { bitmap.close() }
        } else {
          if (packet.reset || !decoder) { frames.reset(); decoder?.destroy(); decoder = createDecoder() }
          if (packet.configuration) decoder.push(packet.configuration, { config: true, timestamp: packet.timestamp })
          decoder.push(packet.data, { timestamp: packet.timestamp, config: packet.config, keyFrame: packet.keyFrame })
        }
      }).catch(() => { if (active && epoch === generation) { display.current = undefined; frames.reset('error'); setError('plusNativeDecodeError') } })
        .finally(() => { void main.nativeMirrorAck(packet.sequence).catch(() => {}) })
    })
    const unsubscribeState = main.on('nativeMirrorState', (session: MirrorSession) => {
      if (active && session.id === id) {
        if (usbInput && (session.state === 'starting' || (session.state === 'running' && connectionState !== 'running'))) {
          touching.current = false; pointer.current = null
          inputFlow.current?.dispose(); inputFlow.current = createInputFlow()
          setError('')
        }
        if (usbInput && (session.state === 'disconnected' || session.state === 'error')) {
          touching.current = false; pointer.current = null; inputFlow.current?.dispose()
        }
        if (session.state !== connectionState && (session.state === 'error' || session.state === 'disconnected' || session.state === 'starting')) invalidate(session.state)
        connectionState = session.state
        setStatus(session.state); setConnectionIssue(session.connectionIssue)
        setVideoMode(session.videoMode || 'screenshot')
      }
    })
    void (async () => {
      try {
        const value = await main.nativeMirrorInfo()
        if (!active) return
        id = value.id; usbInput = value.target.platform === 'ios' && value.target.transport === 'usb'; setInfo(value); setStatus(value.state); setConnectionIssue(value.connectionIssue)
        await main.nativeMirrorOpen()
      } catch { if (active) setStatus('error') }
    })()
    const release = () => {
      if (touching.current) {
        touching.current = false; pointer.current = null
        if (usbInput) inputFlow.current?.send({ type: 'touch', action: 'cancel', ...lastPoint.current })
        else void main.nativeMirrorInput({ type: 'touch', action: 'up', ...lastPoint.current }).catch(() => {})
      }
    }
    window.addEventListener('blur', release)
    return () => {
      active = false; invalidateFrames.current = null; frames.dispose(); release(); inputFlow.current?.dispose(); decoder?.destroy(); unsubscribeFrame(); unsubscribeState()
      observer?.disconnect()
      window.removeEventListener('blur', release)
    }
  }, [])
  async function reconnect(restart = false) {
    touching.current = false; pointer.current = null
    inputFlow.current?.dispose()
    invalidateFrames.current?.('starting')
    setError(''); setStatus('starting')
    try {
      await main.nativeMirrorOpen(restart)
    } catch { setStatus('error') }
  }
  function point(event: { clientX: number; clientY: number }, clamp = false) {
    const element = canvas.current
    if (!element) return undefined
    const rect = element.getBoundingClientRect()
    const scale = Math.min(rect.width / element.width, rect.height / element.height)
    const width = element.width * scale, height = element.height * scale
    if (!width || !height) return undefined
    const x = (event.clientX - rect.left - (rect.width - width) / 2) / width
    const y = (event.clientY - rect.top - (rect.height - height) / 2) / height
    if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return undefined
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }
  function releasePointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!touching.current || pointer.current !== event.pointerId) return
    touching.current = false; pointer.current = null
    lastPoint.current = point(event, true) || lastPoint.current
    send({ type: 'touch', action: iosUsb && event.type !== 'pointerup' ? 'cancel' : 'up', ...lastPoint.current })
  }
  const failed = status === 'error' || status === 'disconnected'
  const setup = status === 'error' && connectionIssue === 'ios-wda' && !presented.current
  const decoding = status === 'running' && error === 'plusNativeDecodeError'
  const statusTitle = setup ? t('plusIosNotReady') : failed ? t(presented.current ? 'plusConnectionInterrupted' : 'plusConnectionFailed') : decoding ? t('plusVideoRecovering') : t('plusNativeStarting')
  return <main className={`${Style.page} ${StatusStyle.theme} ${interactive ? Style.interactive : ''}`}>
    {iosUsb && setupOpen && <IosSetup onClose={()=>setSetupOpen(false)} onReady={()=>{setSetupOpen(false);void reconnect()}} />}
    {!setupOpen && (!interactive || status !== 'running' || decoding) && <div className={!interactive && status === 'running' && !decoding ? undefined : StatusStyle.statusOverlay}>
      {interactive || status !== 'running' || decoding ? <StatusCard title={statusTitle}
        description={decoding ? t('plusNativeDecodeError') : failed || status === 'authorizing' || status === 'waiting' ? statusLabel(status, connectionIssue, presented.current) : t('plusConnectionWaiting')}
        busy={!failed} setup={setup} onRetry={failed ? () => void reconnect() : undefined} /> :
        <div className={Style.receiverStatus} role={failed ? 'alert' : 'status'}>
          <strong>{info?.target.name || t('screencast')}</strong>
          <p>{statusLabel(status, connectionIssue, presented.current)}</p>
          {failed && <button type="button" onClick={() => void reconnect()}>{t('retry')}</button>}
        </div>}
    </div>}
    {error === 'plusNativeInputError' && status === 'running' && <div className={Style.inputNotice} role="alert">
      <StatusIcon />
      <span>{t('plusNativeInputError')}</span>
      <button className={StatusStyle.retryButton} type="button" onClick={() => void reconnect(true)}>{t('plusReconnectControl')}</button>
    </div>}
    {iosUsb && <Toolbar mode={videoMode} busy={videoBusy} connected={status === 'running'} onVideo={() => {
        setVideoBusy(true)
        void main.nativeMirrorVideo(videoMode !== 'video').catch(() => setVideoMode('video-error')).finally(() => setVideoBusy(false))
      }} onHome={() => send({ type: 'key', keyCode: 3 })} onSetup={() => setSetupOpen(true)} />}
    <canvas ref={canvas} width={480} height={800} className={Style.canvas} data-unavailable={status !== 'running'} tabIndex={interactive ? 0 : -1}
      aria-label={t(interactive ? 'plusInteractiveScreen' : 'plusViewOnly')}
      onPointerDown={event => {
        if (!interactive || status !== 'running' || !event.isPrimary || event.button !== 0) return
        const p = point(event); if (!p) return
        event.preventDefault()
        if (!send({ type: 'touch', action: 'down', ...p })) return
        event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
        touching.current = true; pointer.current = event.pointerId; lastPoint.current = p
      }}
      onPointerMove={event => {
        if (!touching.current || pointer.current !== event.pointerId) return
        const p = point(event, true); if (!p) return
        lastPoint.current = p; send({ type: 'touch', action: 'move', ...p })
      }} onPointerUp={releasePointer} onPointerCancel={releasePointer} onLostPointerCapture={releasePointer}
      onWheel={event => {
        if (!interactive || status !== 'running') return
        const p = point(event); if (!p) return
        event.preventDefault(); send({ type: 'scroll', ...p, dx: Math.max(-1, Math.min(1, -event.deltaX / 100)), dy: Math.max(-1, Math.min(1, -event.deltaY / 100)) })
      }}
      onKeyDown={event => {
        if (!interactive || status !== 'running' || event.nativeEvent.isComposing) return
        const codes: Record<string, number> = { Home: 3, Enter: 66, Backspace: 67, Escape: 4, ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22, Tab: 61 }
        if (iosUsb && ['Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return
        if (codes[event.key]) { event.preventDefault(); send({ type: 'key', keyCode: codes[event.key] }) }
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) { event.preventDefault(); send({ type: 'text', text: event.key }) }
      }} />
  </main>
})
