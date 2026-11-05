import { useEffect, useRef, useState } from 'react'
import type { MirrorSession, NativeMirrorFrame, NativeMirrorInfo, NativeMirrorInput } from 'common/types'
import { t } from 'common/util'
import H264Decoder from '../screencast/lib/H264Decoder'
import Style from './App.module.scss'

function statusLabel(state: string) {
  switch (state) {
    case 'authorizing': return t('plusAuthorizing')
    case 'waiting': return t('plusAirplayHint')
    case 'running': return t('plusNativeConnected')
    case 'disconnected': return t('plusNativeDisconnected')
    case 'error': return t('plusNativeError')
    default: return t('plusNativeStarting')
  }
}
export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState<NativeMirrorInfo>()
  const [status, setStatus] = useState<MirrorSession['state']>('starting')
  const [error, setError] = useState('')
  const touching = useRef(false)
  const pointer = useRef<number | null>(null)
  const lastPoint = useRef({ x: 0, y: 0 })
  const android = info?.target.platform === 'android'
  const send = (input: NativeMirrorInput) => { void main.nativeMirrorInput(input).catch(() => setError(t('plusNativeInputError'))) }
  useEffect(() => {
    let active = true, id: string | undefined
    let decoder: H264Decoder | undefined
    let hasFrame = false, lastFit = ''
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
    const createDecoder = () => new H264Decoder(frame => {
      try {
        const element = canvas.current
        if (!active || !element) return
        if (element.width !== frame.displayWidth || element.height !== frame.displayHeight) {
          element.width = frame.displayWidth; element.height = frame.displayHeight
        }
        hasFrame = true; fitCanvas()
        element.getContext('2d')?.drawImage(frame, 0, 0)
      } finally { frame.close() }
    }, error => { console.error('Native video decode failed', error); if (active) setError(t('plusNativeDecodeError')) })
    const unsubscribeFrame = main.on('nativeMirrorFrame', (packet: NativeMirrorFrame) => {
      if (!active || packet.sessionId !== id) return
      try {
        if (packet.reset || !decoder) { decoder?.destroy(); decoder = createDecoder() }
        if (packet.configuration) decoder.push(packet.configuration, { config: true, timestamp: packet.timestamp })
        decoder.push(packet.data, { timestamp: packet.timestamp, config: packet.config, keyFrame: packet.keyFrame })
      } finally { void main.nativeMirrorAck(packet.sequence).catch(() => {}) }
    })
    const unsubscribeState = main.on('nativeMirrorState', (session: MirrorSession) => {
      if (active && session.id === id) setStatus(session.state)
    })
    void (async () => {
      try {
        const value = await main.nativeMirrorInfo()
        if (!active) return
        id = value.id; setInfo(value); setStatus(value.state)
        if (value.target.platform === 'android') preload.setTitle(value.target.name)
        await main.nativeMirrorOpen()
      } catch { if (active) setStatus('error') }
    })()
    const release = () => {
      if (touching.current) {
        touching.current = false; pointer.current = null
        void main.nativeMirrorInput({ type: 'touch', action: 'up', ...lastPoint.current }).catch(() => {})
      }
    }
    window.addEventListener('blur', release)
    return () => {
      active = false; release(); decoder?.destroy(); unsubscribeFrame(); unsubscribeState()
      observer?.disconnect()
      window.removeEventListener('blur', release)
    }
  }, [])
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
    send({ type: 'touch', action: 'up', ...lastPoint.current })
  }
  return <main className={`${Style.page} ${android ? Style.android : ''}`}>
    {(!android || status !== 'running' || error) && <header><strong>{info?.target.name || t('screencast')}</strong><span>{statusLabel(status)}</span></header>}
    {error && <p className={Style.error} role="alert">{error}</p>}
    {(status === 'error' || status === 'disconnected') && <button type="button" onClick={() => {
      setError(''); setStatus('starting'); void main.nativeMirrorOpen().catch(() => setStatus('error'))
    }}>{t('retry')}</button>}
    <canvas ref={canvas} width={480} height={800} className={Style.canvas} tabIndex={android ? 0 : -1}
      aria-label={t(android ? 'plusInteractiveScreen' : 'plusViewOnly')}
      onPointerDown={event => {
        if (!android || status !== 'running' || !event.isPrimary || event.button !== 0) return
        const p = point(event); if (!p) return
        event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
        touching.current = true; pointer.current = event.pointerId; lastPoint.current = p; send({ type: 'touch', action: 'down', ...p })
      }}
      onPointerMove={event => {
        if (!touching.current || pointer.current !== event.pointerId) return
        const p = point(event, true); if (!p) return
        lastPoint.current = p; send({ type: 'touch', action: 'move', ...p })
      }} onPointerUp={releasePointer} onPointerCancel={releasePointer} onLostPointerCapture={releasePointer}
      onWheel={event => {
        if (!android || status !== 'running') return
        const p = point(event); if (!p) return
        event.preventDefault(); send({ type: 'scroll', ...p, dx: Math.max(-1, Math.min(1, -event.deltaX / 100)), dy: Math.max(-1, Math.min(1, -event.deltaY / 100)) })
      }}
      onKeyDown={event => {
        if (!android || status !== 'running' || event.nativeEvent.isComposing) return
        const codes: Record<string, number> = { Enter: 66, Backspace: 67, Escape: 4, ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22, Tab: 61 }
        if (codes[event.key]) { event.preventDefault(); send({ type: 'key', keyCode: codes[event.key] }) }
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) { event.preventDefault(); send({ type: 'text', text: event.key }) }
      }} />
  </main>
}
