import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { Terminal, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import each from 'licia/each'
import replaceAll from 'licia/replaceAll'
import Style from './Terminal.module.scss'
import ToolWindow from '../../tool-window/ToolWindow'
import store from '../store'
import '@xterm/xterm/css/xterm.css'
import contextMenu from '../../lib/contextMenu'
import { t } from '../../../common/i18n'
import copy from 'licia/copy'

export default observer(function () {
  const [error, setError] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal>(null)

  useEffect(() => {
    let disposed = false
    const term = new Terminal({
      allowProposedApi: true,
      fontSize: 14,
      fontFamily: 'mono, courier-new, courier, monospace',
      theme: getTheme(store.theme === 'dark'),
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    try {
      term.loadAddon(new WebglAddon())
    } catch {
      term.loadAddon(new CanvasAddon())
    }
    term.open(terminalRef.current!)
    const write = (log: string) => {
      if (!disposed) term.write(replaceAll(log, '\n', '\r\n'))
    }
    const fit = () => fitAddon.fit()
    fit()

    window.addEventListener('resize', fit)
    main
      .getLogs()
      .then((logs: string[]) => {
        if (!disposed) each(logs, (log) => write(log))
      })
      .catch(() => {
        if (!disposed) setError(true)
      })
    const unsubscribe = main.on('addLog', write)

    termRef.current = term

    return () => {
      disposed = true
      unsubscribe()
      termRef.current = null
      term.dispose()
      window.removeEventListener('resize', fit)
    }
  }, [])

  const copySelection = () => {
    const term = termRef.current
    if (term?.hasSelection()) copy(term.getSelection())
    term?.focus()
  }
  const selectAll = () => {
    termRef.current?.selectAll()
    termRef.current?.focus()
  }
  const clearLogs = async () => {
    const term = termRef.current
    if (!term) return
    try {
      await main.clearLogs()
      if (termRef.current !== term) return
      term.clear()
      term.focus()
      setError(false)
    } catch {
      if (termRef.current === term) setError(true)
    }
  }
  const onContextMenu = (event: React.MouseEvent) => {
    const term = termRef.current
    if (!term) return
    const current = () => termRef.current === term
    contextMenu(event, [
      {
        label: t('copy'),
        click: () => {
          if (current()) copySelection()
        },
      },
      {
        label: t('selectAll'),
        click: () => {
          if (current()) selectAll()
        },
      },
      { type: 'separator' },
      {
        label: t('clear'),
        click: () => {
          if (current()) void clearLogs()
        },
      },
    ])
  }
  useEffect(() => {
    if (termRef.current)
      termRef.current.options.theme = getTheme(store.theme === 'dark')
  }, [store.theme])

  return (
    <ToolWindow
      theme={store.theme}
      title={t('applicationLogs')}
      description={t('applicationLogsDescription')}
      actions={
        <>
          <button type="button" onClick={copySelection}>
            {t('copy')}
          </button>
          <button type="button" onClick={selectAll}>
            {t('selectAll')}
          </button>
          <button
            type="button"
            onClick={() => {
              void clearLogs()
            }}
          >
            {t('clear')}
          </button>
        </>
      }
    >
      {error && <p role="alert">{t('applicationLogsError')}</p>}
      <div className={Style.terminalContainer}>
        <div
          className={Style.terminal}
          ref={terminalRef}
          onContextMenu={onContextMenu}
        />
      </div>
    </ToolWindow>
  )
})

function getTheme(dark = false): ITheme {
  return {
    background: dark ? '#202329' : '#ffffff',
    foreground: dark ? '#f0f2f5' : '#20242b',
    cursor: dark ? '#f0f2f5' : '#20242b',
    selectionForeground: dark ? '#f0f2f5' : '#20242b',
    selectionBackground: dark ? '#273c5c' : '#e8f0ff',
  }
}
