import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import uuid from 'licia/uuid'
import { t } from 'common/util'
import store from '../../store'
import Term from './Term'
import WorkspaceDialog from '../workspace/WorkspaceDialog'
import Style from './Shell.module.scss'

interface IShell {
  id: string
  name: string
  sessionId: string
  terminal?: Terminal
}

export default observer(function Shell() {
  const [shells, setShells] = useState<IShell[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)
  const numRef = useRef(1)
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const surface = useRef<HTMLDivElement>(null)
  const focusAfterClose = useRef(false)
  const alive = useRef(false)
  const key = store.target?.key
  const selected = shells.find((shell) => shell.id === selectedId)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(focusTimer.current)
    }
  }, [])
  useEffect(() => {
    setShells([])
    setSelectedId(null)
    setPalette(false)
    setError(false)
    if (key) add(true)
  }, [key])
  useEffect(() => {
    if (focusAfterClose.current) {
      const tab = surface.current?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"]',
      )
      ;(
        tab ||
        surface.current?.querySelector<HTMLButtonElement>('[data-add-shell]')
      )?.focus()
      focusAfterClose.current = false
    }
  }, [selectedId, shells])

  function add(replace = false) {
    if (!key) return
    const shell = {
      id: uuid(),
      name: `${t('shell')} ${numRef.current++}`,
      sessionId: '',
    }
    setShells((previous) => (replace ? [shell] : [...previous, shell]))
    setSelectedId(shell.id)
  }
  function close(id: string) {
    clearTimeout(focusTimer.current)
    const index = shells.findIndex((shell) => shell.id === id)
    const remaining = shells.filter((shell) => shell.id !== id)
    setShells(remaining)
    if (id === selectedId)
      setSelectedId(
        remaining[Math.min(index, remaining.length - 1)]?.id ?? null,
      )
    focusAfterClose.current = true
  }
  function updateShell(id: string, values: Partial<IShell>) {
    setShells((previous) =>
      previous.map((shell) =>
        shell.id === id ? { ...shell, ...values } : shell,
      ),
    )
  }
  async function run(command: string) {
    const shell = selected
    const origin = key
    if (!shell?.sessionId || !origin) return
    setPalette(false)
    setError(false)
    try {
      await main.writeShell(shell.sessionId, command)
      if (alive.current && store.target?.key === origin) {
        clearTimeout(focusTimer.current)
        focusTimer.current = setTimeout(() => {
          if (
            alive.current &&
            store.target?.key === origin &&
            store.panel === 'shell' &&
            selectedRef.current?.id === shell.id &&
            selectedRef.current.sessionId === shell.sessionId
          )
            shell.terminal?.focus()
        }, 0)
      }
    } catch {
      if (alive.current && store.target?.key === origin) setError(true)
    }
  }

  const commands = [
    [t('reboot'), 'reboot\n'],
    [t('getUdid'), 'bm get --udid\n'],
    [t('batteryInfo'), 'hidumper -s BatteryService -a -i\n'],
  ].filter(([label, command]) =>
    `${label} ${command}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className={Style.page}>
      <div className={Style.surface} ref={surface}>
        <header className={Style.heading}>
          <h1>{t('shell')}</h1>
          <p>{t('shellDescription')}</p>
        </header>
        <div className={Style.toolbar}>
          <span className={Style.count}>
            {t('shellSessionCount', { total: shells.length })}
          </span>
          <div className={Style.actions}>
            <button
              type="button"
              data-add-shell
              disabled={!key}
              onClick={() => add()}
            >
              {t('add')}
            </button>
            <button
              type="button"
              disabled={!key || !selected}
              onClick={() => {
                setQuery('')
                setPalette(true)
              }}
            >
              {t('shortcut')}
            </button>
          </div>
        </div>
        {error && (
          <div role="alert" className={Style.error}>
            {t('shellWriteError')}
          </div>
        )}
        <div
          className={Style.tabs}
          role="tablist"
          aria-label={t('shellSessions')}
        >
          {shells.map((shell) => (
            <div className={Style.tab} key={shell.id}>
              <button
                type="button"
                id={`shell-tab-${shell.id}`}
                role="tab"
                aria-selected={selectedId === shell.id}
                aria-controls={`shell-panel-${shell.id}`}
                onClick={() => setSelectedId(shell.id)}
              >
                {shell.name}
              </button>
              <button
                type="button"
                aria-label={t('closeShell', { name: shell.name })}
                title={t('closeShell', { name: shell.name })}
                onClick={() => close(shell.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className={Style.body}>
          {shells.map((shell) => (
            <div
              key={shell.id}
              id={`shell-panel-${shell.id}`}
              role="tabpanel"
              aria-labelledby={`shell-tab-${shell.id}`}
              className={Style.terminalPanel}
              hidden={selectedId !== shell.id}
            >
              <Term
                onSessionIdChange={(id) =>
                  updateShell(shell.id, { sessionId: id })
                }
                onCreate={(terminal) => updateShell(shell.id, { terminal })}
                visible={selectedId === shell.id && store.panel === 'shell'}
              />
            </div>
          ))}
          {!shells.length && (
            <div className={Style.empty}>
              <p>{t(key ? 'shellEmpty' : 'targetNotConnected')}</p>
              <p>
                {t(key ? 'shellNewSessionHint' : 'workspaceConnectToStart')}
              </p>
            </div>
          )}
        </div>
        <footer className={Style.footer}>{t('shellSessionHint')}</footer>
      </div>
      <WorkspaceDialog
        visible={palette}
        title={t('shortcut')}
        onClose={() => setPalette(false)}
      >
        <div className={Style.commands}>
          <p>{t('shellShortcutHint')}</p>
          <input
            type="search"
            aria-label={t('typeCmd')}
            placeholder={t('typeCmd')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {commands.map(([label, command]) => (
            <button
              type="button"
              key={command}
              disabled={!selected?.sessionId}
              onClick={() => void run(command)}
            >
              <span>{label}</span>
              <code>{command.trim()}</code>
            </button>
          ))}
          {!commands.length && <p>{t('shellNoCommands')}</p>}
        </div>
      </WorkspaceDialog>
    </div>
  )
})
