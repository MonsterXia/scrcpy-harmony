import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import LunaLogcat from 'luna-logcat/react'
import Logcat from 'luna-logcat'
import rpad from 'licia/rpad'
import dateFormat from 'licia/dateFormat'
import trim from 'licia/trim'
import copy from 'licia/copy'
import download from 'licia/download'
import { t } from 'common/util'
import contextMenu from 'share/renderer/lib/contextMenu'
import store from '../../store'
import Style from './Hilog.module.scss'

// Match Luna's batched eviction: 10,000 retained after reaching 11,000.
const MAX_LOGS = 10000
const TRIM_BATCH = Math.round(MAX_LOGS / 10)
interface LogFilter {
  priority?: number
  package?: string
  tag?: string
}

function matchesFilter(entry: any, filter: LogFilter) {
  return (
    (!filter.priority || entry.level >= filter.priority) &&
    String(entry.bundleName || '')
      .toLowerCase()
      .includes((filter.package || '').trim().toLowerCase()) &&
    `${getTypePrefix(entry.type)}${entry.domain}/${entry.tag}`
      .toLowerCase()
      .includes((filter.tag || '').trim().toLowerCase())
  )
}

export default observer(function Hilog() {
  const [view, setView] = useState<'compact' | 'standard'>('standard')
  const [softWrap, setSoftWrap] = useState(false)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<LogFilter>({})
  const [revision, setRevision] = useState(0)
  const [sessionId, setSessionId] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'idle'>(
    'idle',
  )
  const [hasEntries, setHasEntries] = useState(false)
  const [hasMatches, setHasMatches] = useState(false)
  const logcatRef = useRef<Logcat>(null)
  const entriesRef = useRef<any[]>([])
  const hilogIdRef = useRef('')
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const filterRef = useRef(filter)
  filterRef.current = filter
  const key = store.target?.key
  const active = store.panel === 'hilog'

  function clear() {
    logcatRef.current?.clear()
    // Luna clear() resets retained entries but leaves display bookkeeping.
    // Reapplying the equivalent filter rebuilds that list for future eviction.
    logcatRef.current?.setOption('filter', { ...filterRef.current })
    entriesRef.current = []
    setHasEntries(false)
    setHasMatches(false)
  }
  useEffect(() => {
    setHasMatches(
      entriesRef.current.some((entry) => matchesFilter(entry, filter)),
    )
  }, [filter])
  useEffect(() => {
    let disposed = false
    const current = () => !disposed && store.target?.key === key
    clear()
    setStatus(key ? 'loading' : 'idle')
    setSessionId('')
    hilogIdRef.current = ''
    const close = async (id: string) => {
      try {
        await main.closeHilog(id)
      } catch {
        /* Already closed or disconnected. */
      }
    }
    const off = main.on('hilogEntry', (id, entry) => {
      if (
        !current() ||
        hilogIdRef.current !== id ||
        pausedRef.current ||
        store.panel !== 'hilog' ||
        !logcatRef.current
      )
        return
      logcatRef.current.append({
        date: entry.date,
        pid: entry.pid,
        tid: entry.tid,
        priority: entry.level,
        tag: `${getTypePrefix(entry.type)}${entry.domain}/${entry.tag}`,
        package: entry.bundleName,
        message: entry.message,
      })
      const entries = entriesRef.current
      entries.push(entry)
      if (entries.length >= MAX_LOGS + TRIM_BATCH) {
        entries.splice(0, TRIM_BATCH)
        setHasMatches(
          entries.some((item) => matchesFilter(item, filterRef.current)),
        )
      } else if (matchesFilter(entry, filterRef.current)) setHasMatches(true)
      setHasEntries(true)
    })
    if (key) {
      void (async () => {
        try {
          const id = await main.openHilog(key)
          if (!current()) {
            await close(id)
            return
          }
          hilogIdRef.current = id
          setSessionId(id)
          setStatus('ready')
        } catch {
          if (current()) setStatus('error')
        }
      })()
    }
    return () => {
      disposed = true
      off()
      const id = hilogIdRef.current
      hilogIdRef.current = ''
      if (id) void close(id)
    }
  }, [key, revision])

  useEffect(() => {
    if (!sessionId || sessionId !== hilogIdRef.current) return
    let cancelled = false
    void (async () => {
      try {
        if (paused || !active) await main.pauseHilog(sessionId)
        else await main.resumeHilog(sessionId)
      } catch {
        if (
          !cancelled &&
          hilogIdRef.current === sessionId &&
          store.target?.key === key
        )
          setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, paused, active, key])

  function save() {
    const data = entriesRef.current
      .map((entry) =>
        trim(
          `${dateFormat(entry.date, 'mm-dd HH:MM:ss.l')} ${rpad(entry.pid, 5, ' ')} ${rpad(entry.tid, 5, ' ')} ${toLetter(entry.level)} ${getTypePrefix(entry.type)}${entry.domain}/${entry.tag}: ${entry.message}`,
        ),
      )
      .join('\n')
    const name = `${store.target?.name || 'hilog'}.${dateFormat('yyyymmddHH')}.txt`
    download(data, name, 'text/plain')
  }
  const onContextMenu = (event: PointerEvent, entry: any) => {
    event.preventDefault()
    const logcat = logcatRef.current
    if (!logcat) return
    // Luna's data-idx lookup predates batched eviction. Read the literal row
    // message so Copy still refers to the row that opened this menu.
    const message =
      (event.target as HTMLElement | null)
        ?.closest?.('.luna-logcat-entry')
        ?.querySelector('.luna-logcat-message')?.textContent ?? entry?.message
    contextMenu(event, [
      {
        label: t('copy'),
        click: () => {
          if (logcatRef.current !== logcat) return
          if (logcat.hasSelection()) copy(logcat.getSelection())
          else if (message) copy(message)
        },
      },
      { type: 'separator' },
      { label: t('clear'), click: clear },
    ])
  }

  return (
    <div className={Style.page}>
      <header className={Style.heading}>
        <h1>{t('hilog')}</h1>
        <p>{t('hilogDescription')}</p>
      </header>
      <div className={Style.toolbar}>
        <label>
          {t('hilogView')}
          <select
            value={view}
            onChange={(event) =>
              setView(event.target.value as 'compact' | 'standard')
            }
          >
            <option value="standard">{t('standardView')}</option>
            <option value="compact">{t('compactView')}</option>
          </select>
        </label>
        <label>
          {t('hilogPriority')}
          <select
            value={filter.priority || 2}
            onChange={(event) =>
              setFilter({ ...filter, priority: Number(event.target.value) })
            }
          >
            <option value={2}>{t('hilogLevelVerbose')}</option>
            <option value={3}>{t('hilogLevelDebug')}</option>
            <option value={4}>{t('hilogLevelInfo')}</option>
            <option value={5}>{t('hilogLevelWarning')}</option>
            <option value={6}>{t('hilogLevelError')}</option>
          </select>
        </label>
        <input
          type="search"
          aria-label={t('bundleName')}
          placeholder={t('bundleName')}
          value={filter.package || ''}
          onChange={(event) =>
            setFilter({ ...filter, package: event.target.value })
          }
        />
        <input
          type="search"
          aria-label={t('tag')}
          placeholder={t('tag')}
          value={filter.tag || ''}
          onChange={(event) =>
            setFilter({ ...filter, tag: event.target.value })
          }
        />
      </div>
      <div className={Style.toolbar}>
        <label>
          <input
            type="checkbox"
            checked={softWrap}
            onChange={(event) => setSoftWrap(event.target.checked)}
          />
          {t('softWrap')}
        </label>
        <span className={Style.count} role="status">
          {t(
            !key
              ? 'targetNotConnected'
              : status === 'loading'
                ? 'hilogConnecting'
                : status === 'error'
                  ? 'hilogInterrupted'
                  : paused || !active
                    ? 'hilogPaused'
                    : 'hilogLive',
          )}
        </span>
        <div className={Style.actions}>
          <button
            type="button"
            disabled={!key || !sessionId}
            onClick={() => setPaused((previous) => !previous)}
          >
            {t(paused ? 'resume' : 'pause')}
          </button>
          <button
            type="button"
            disabled={!key}
            onClick={() => setRevision((previous) => previous + 1)}
          >
            {t('restart')}
          </button>
          <button
            type="button"
            disabled={!hasEntries}
            onClick={() => logcatRef.current?.scrollToEnd()}
          >
            {t('scrollToEnd')}
          </button>
          <button type="button" disabled={!hasEntries} onClick={save}>
            {t('save')}
          </button>
          <button type="button" disabled={!hasEntries} onClick={clear}>
            {t('clear')}
          </button>
        </div>
      </div>
      {status === 'error' && (
        <div role="alert" className={Style.error}>
          {t('hilogLoadError')}
        </div>
      )}
      <div className={Style.body} aria-busy={status === 'loading'}>
        <LunaLogcat
          maxNum={MAX_LOGS}
          filter={filter}
          wrapLongLines={softWrap}
          onContextMenu={onContextMenu}
          view={view}
          onCreate={(logcat) => {
            logcatRef.current = logcat
          }}
        />
        {!hasEntries && status !== 'error' && (
          <div className={Style.empty}>
            {t(
              !key
                ? 'targetNotConnected'
                : status === 'loading'
                  ? 'hilogConnecting'
                  : paused
                    ? 'hilogPaused'
                    : 'hilogWaiting',
            )}
          </div>
        )}
        {hasEntries && !hasMatches && (
          <div className={Style.empty}>{t('hilogNoResults')}</div>
        )}
      </div>
      <footer className={Style.footer}>{t('hilogExportHint')}</footer>
    </div>
  )
})

function toLetter(priority: number) {
  return ['?', '?', 'V', 'D', 'I', 'W', 'E'][priority]
}
function getTypePrefix(type: number) {
  return ['A', 'I', 'C', 'K', 'P'][type]
}
