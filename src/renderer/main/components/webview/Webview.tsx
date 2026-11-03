import { observer } from 'mobx-react-lite'
import Style from './Webview.module.scss'
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from 'common/util'
import LunaDataGrid from 'luna-data-grid/react'
import map from 'licia/map'
import store from '../../store'
import DataGrid from 'luna-data-grid'
import { useWindowResize } from 'share/renderer/lib/hooks'

export default observer(function Webview() {
  const [webviews, setWebviews] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [topBundle, setTopBundle] = useState({
    name: '',
    pid: 0,
  })
  const dataGridRef = useRef<DataGrid>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [read, setRead] = useState(false)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const refreshRef = useRef<() => void>(() => {})

  const connectKey = store.target?.key
  const active = store.panel === 'webview'

  useEffect(() => {
    let destroyed = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let previousPid = 0
    let busy = false

    function clear() {
      setTopBundle({ name: '', pid: 0 })
      setWebviews([])
      setSelected(null)
      previousPid = 0
    }

    clear()
    setLoading(false)
    setError(false)
    setRead(false)
    if (!connectKey || !active) return

    // IPC cannot be cancelled here. Abandoned passes must not continue or
    // publish results after the panel/device changes, including before cleanup.
    const isCurrent = () =>
      !destroyed &&
      store.target?.key === connectKey &&
      store.panel === 'webview'

    async function getWebviews() {
      if (!isCurrent() || busy) return
      clearTimeout(timeout)
      busy = true
      setLoading(true)
      try {
        const topBundle = await main.getTopBundle(connectKey)
        if (!isCurrent()) return
        const webviews = topBundle.pid
          ? await main.getWebviews(connectKey, topBundle.pid)
          : []
        if (!isCurrent()) return
        const rows = map(webviews, (webview: any) => {
          const title = document.createElement('span')
          title.textContent = webview.title
          if (webview.faviconUrl) {
            const icon = document.createElement('img')
            icon.src = webview.faviconUrl
            title.prepend(icon)
          }

          return {
            ...webview,
            titleText: webview.title,
            title,
          }
        })
        const sameProcess = previousPid === topBundle.pid
        setTopBundle(topBundle)
        setWebviews(rows)
        setSelected((selected) =>
          sameProcess && selected
            ? rows.find((row) => row.id === selected.id) || null
            : null,
        )
        previousPid = topBundle.pid
        setError(false)
        setRead(true)
      } catch {
        if (isCurrent()) {
          clear()
          setError(true)
        }
      }
      busy = false
      if (isCurrent()) {
        setLoading(false)
        timeout = setTimeout(getWebviews, 2000)
      }
    }

    refreshRef.current = () => {
      void getWebviews()
    }
    void getWebviews()

    return () => {
      destroyed = true
      clearTimeout(timeout)
    }
  }, [connectKey, active])

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return webviews.filter((row) =>
      [row.titleText, row.url, row.type].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query),
      ),
    )
  }, [webviews, filter])
  const selection = selected && visible.find((row) => row.id === selected.id)
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const enhance = () => {
      surface.querySelector('.luna-data-grid')?.setAttribute('tabindex', '-1')
      surface
        .querySelectorAll<HTMLElement>('.luna-data-grid-node')
        .forEach((row) => {
          const data = (row as any).dataGridNode?.data
          if (!data) return
          row.tabIndex = 0
          row.dataset.webviewId = data.id
          row.setAttribute('aria-label', `${data.titleText}, ${data.url}`)
        })
    }
    enhance()
    const observer = new window.MutationObserver(enhance)
    observer.observe(surface, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [visible, topBundle.pid])
  useWindowResize(() => dataGridRef.current?.fit())
  useEffect(() => {
    if (active) dataGridRef.current?.fit()
  }, [active])
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const observer = new window.ResizeObserver(() => dataGridRef.current?.fit())
    observer.observe(surface)
    return () => observer.disconnect?.()
  }, [])
  return (
    <div className={Style.page} data-webview aria-busy={loading}>
      <header className={Style.heading}>
        <h1>{t('webview')}</h1>
        <p>{t('webviewDescription')}</p>
      </header>
      <div className={Style.toolbar}>
        <input
          type="search"
          aria-label={t('webviewSearch')}
          placeholder={t('webviewSearch')}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <span className={Style.bundle} data-bundle>
          {topBundle.name}
        </span>
        <div className={Style.actions}>
          <button
            type="button"
            data-action="refresh"
            disabled={!connectKey || loading}
            onClick={() => refreshRef.current()}
          >
            {t('refresh')}
          </button>
          <button
            type="button"
            data-action="debug"
            disabled={!selection}
            onClick={() => {
              let url = 'devtools://devtools/bundled/inspector.html'
              url += `?ws=${selection.webSocketDebuggerUrl.replace('ws://', '')}`
              main.openWindow(url, 'devtools')
            }}
          >
            {t('inspect')}
          </button>
          <button
            type="button"
            data-action="browser"
            disabled={!selection}
            onClick={() => main.openExternal(selection.url)}
          >
            {t('openWithBrowser')}
          </button>
        </div>
      </div>
      {error && (
        <div className={Style.error} role="alert">
          <span>{t('webviewLoadError')}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => refreshRef.current()}
          >
            {t('retry')}
          </button>
        </div>
      )}
      <div
        className={Style.body}
        ref={surfaceRef}
        onKeyDown={(event) => {
          const row = (event.target as HTMLElement).closest<HTMLElement>(
            '[data-webview-id]',
          )
          if (!row) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            dataGridRef.current?.selectSingle((row as any).dataGridNode)
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const rows = Array.from(
              surfaceRef.current?.querySelectorAll<HTMLElement>(
                '[data-webview-id]',
              ) || [],
            )
            const next =
              rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)]
            if (next) {
              next.focus()
              dataGridRef.current?.selectSingle((next as any).dataGridNode)
              next.scrollIntoView?.({ block: 'nearest' })
            }
          }
        }}
      >
        <LunaDataGrid
          key={topBundle.pid}
          onSelect={(node) => setSelected(node.data)}
          onDeselect={() => setSelected(null)}
          className={Style.webviews}
          filter=""
          columns={columns}
          data={visible}
          selectable={true}
          uniqueId="id"
          onCreate={(grid) => {
            dataGridRef.current = grid
            grid.fit()
          }}
        />
        {!visible.length && !error && (
          <div className={Style.empty} role="status">
            {t(
              !connectKey
                ? 'targetNotConnected'
                : loading && !read
                  ? 'workspaceLoading'
                  : filter.trim() && webviews.length
                    ? 'webviewNoResults'
                    : 'webviewEmpty',
            )}
          </div>
        )}
      </div>
      <footer className={Style.footer} role="status">
        {selection && (
          <div className={Style.selectedUrl} data-selected-url>
            {selection.url}
          </div>
        )}
        {t(
          loading
            ? 'webviewReading'
            : read
              ? 'webviewRead'
              : 'webviewPollingHint',
        )}
      </footer>
    </div>
  )
})

const columns = [
  {
    id: 'title',
    title: t('title'),
    sortable: true,
    weight: 20,
  },
  {
    id: 'url',
    title: 'URL',
    sortable: true,
  },
  {
    id: 'type',
    title: t('type'),
    sortable: true,
    weight: 10,
  },
]
