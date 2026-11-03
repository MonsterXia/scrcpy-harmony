import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import store from '../../store'
import { Terminal, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import {
  colorBgContainer,
  colorBgContainerDark,
  colorPrimary,
  colorText,
  colorTextDark,
  fontFamilyCode,
} from 'common/theme'
import copy from 'licia/copy'
import isHidden from 'licia/isHidden'
import { t } from 'common/util'
import contextMenu from 'share/renderer/lib/contextMenu'
import Style from './Term.module.scss'
import '@xterm/xterm/css/xterm.css'

interface ITermProps {
  visible: boolean
  onSessionIdChange: (id: string) => void
  onCreate: (terminal: Terminal) => void
}

export default observer(function Term(props: ITermProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal>(null)
  const sessionIdRef = useRef('')
  const resetRef = useRef<() => void>(() => {})
  const fitRef = useRef<() => void>(() => {})
  const callbacks = useRef(props)
  callbacks.current = props
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'idle'>(
    'idle',
  )
  const key = store.target?.key
  const dark = store.theme === 'dark'

  useEffect(() => {
    let disposed = false
    let generation = 0
    const current = () => !disposed && store.target?.key === key
    const term = new Terminal({
      allowProposedApi: true,
      fontSize: 14,
      fontFamily: fontFamilyCode,
      theme: getTheme(store.theme === 'dark'),
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.open(terminalRef.current!)
    try {
      term.loadAddon(new WebglAddon())
    } catch {
      term.loadAddon(new CanvasAddon())
    }
    termRef.current = term
    callbacks.current.onCreate(term)
    const fit = () => {
      if (
        current() &&
        callbacks.current.visible &&
        terminalRef.current &&
        !isHidden(terminalRef.current)
      )
        fitAddon.fit()
    }
    fitRef.current = fit
    const observer = new ResizeObserver(fit)
    observer.observe(terminalRef.current!)
    window.addEventListener('resize', fit)
    async function kill(id: string) {
      if (!id) return
      try {
        await main.killShell(id)
      } catch {
        /* Session is already closed or the device disconnected. */
      }
    }
    function setSessionId(id: string) {
      sessionIdRef.current = id
      callbacks.current.onSessionIdChange(id)
    }
    async function create() {
      const request = ++generation
      const previous = sessionIdRef.current
      setSessionId('')
      void kill(previous)
      if (!key || !current()) return
      setStatus('loading')
      term.reset()
      try {
        const id = await main.createShell(key)
        if (!current() || request !== generation) {
          await kill(id)
          return
        }
        setSessionId(id)
        setStatus('ready')
        fit()
      } catch {
        if (current() && request === generation) setStatus('error')
      }
    }
    resetRef.current = () => {
      if (current()) void create()
    }
    const input = term.onData(async (data) => {
      const id = sessionIdRef.current
      if (!current() || !id) return
      try {
        await main.writeShell(id, data)
      } catch {
        if (current() && sessionIdRef.current === id) setStatus('error')
      }
    })
    const offShellData = main.on('shellData', (id, data) => {
      if (current() && id === sessionIdRef.current) term.write(data)
    })
    if (key) void create()
    return () => {
      disposed = true
      generation++
      offShellData()
      input.dispose()
      observer.disconnect()
      window.removeEventListener('resize', fit)
      void kill(sessionIdRef.current)
      sessionIdRef.current = ''
      termRef.current = null
      fitRef.current = () => {}
      resetRef.current = () => {}
      term.dispose()
    }
  }, [key])

  useEffect(() => {
    if (!props.visible) return
    fitRef.current()
    const timer = setTimeout(() => termRef.current?.focus(), 500)
    return () => clearTimeout(timer)
  }, [props.visible, status, key])
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = getTheme(dark)
  }, [dark])

  const onContextMenu = (event: React.MouseEvent) => {
    const term = termRef.current
    if (!key || !term) return
    const current = () => termRef.current === term && store.target?.key === key
    contextMenu(event, [
      {
        label: t('copy'),
        click: () => {
          if (current() && term.hasSelection()) {
            copy(term.getSelection())
            term.focus()
          }
        },
      },
      {
        label: t('paste'),
        click: async () => {
          const id = sessionIdRef.current
          if (!current() || !id) return
          try {
            const text = await navigator.clipboard.readText()
            if (text && current() && sessionIdRef.current === id)
              await main.writeShell(id, text)
          } catch {
            if (current() && sessionIdRef.current === id) setStatus('error')
          }
        },
      },
      {
        label: t('selectAll'),
        click: () => {
          if (current()) term.selectAll()
        },
      },
      { type: 'separator' },
      {
        label: t('reset'),
        click: () => {
          if (current()) resetRef.current()
        },
      },
      {
        label: t('clear'),
        click: () => {
          if (current()) {
            term.clear()
            term.focus()
          }
        },
      },
    ])
  }
  return (
    <div
      className={Style.container}
      style={{ display: props.visible ? 'block' : 'none' }}
    >
      <div
        className={Style.term}
        ref={terminalRef}
        onContextMenu={onContextMenu}
      />
      {status === 'loading' && (
        <div className={Style.status} role="status">
          {t('shellConnecting')}
        </div>
      )}
      {status === 'error' && (
        <div className={Style.error} role="alert">
          {t('shellSessionError')}
          <button type="button" onClick={() => resetRef.current()}>
            {t('retry')}
          </button>
        </div>
      )}
    </div>
  )
})

function getTheme(dark = false) {
  let theme: ITheme = {
    background: colorBgContainer,
    foreground: colorText,
    cursor: colorText,
  }

  if (dark) {
    theme = {
      background: colorBgContainerDark,
      foreground: colorTextDark,
      cursor: colorTextDark,
    }
  }

  return {
    selectionForeground: '#fff',
    selectionBackground: colorPrimary,
    ...theme,
  }
}
