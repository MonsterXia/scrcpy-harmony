import { observer } from 'mobx-react-lite'
import { useEffect, useMemo, useRef, useState } from 'react'
import store from '../../store'
import LunaDataGrid from 'luna-data-grid/react'
import DataGrid from 'luna-data-grid'
import fileSize from 'licia/fileSize'
import { t } from 'common/util'
import { useWindowResize } from 'share/renderer/lib/hooks'
import ConfirmDialog from '../workspace/ConfirmDialog'
import Style from './Process.module.scss'

export default observer(function Process() {
  const [processes, setProcesses] = useState<any[]>([])
  const [selectedPid, setSelectedPid] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [confirmation, setConfirmation] = useState<{
    key: string
    bundle: string
  } | null>(null)
  const dataGridRef = useRef<DataGrid>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  const actionRef = useRef(false)
  const mounted = useRef(false)
  const key = store.target?.key
  const active = store.panel === 'process'
  const onlyBundle = store.process.onlyBundle

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    setProcesses([])
    setSelectedPid(null)
    setConfirmation(null)
    setError(false)
    setStopping(false)
    actionRef.current = false
  }, [key])

  useEffect(() => {
    let cancelled = false
    let busy = false
    let timer: ReturnType<typeof setTimeout>
    let bundles: string[] | undefined
    const current = () =>
      !cancelled && store.target?.key === key && store.panel === 'process'
    const refresh = async () => {
      if (!key || !current() || busy) return
      clearTimeout(timer)
      busy = true
      setLoading(true)
      try {
        const [list, names] = await Promise.all([
          main.getProcesses(key),
          bundles ? Promise.resolve(bundles) : main.getBundles(key),
        ])
        if (!current()) return
        bundles = names
        setProcesses(
          list.map((process: any) => {
            const name = process.name.match(/^[\w.]+/)?.[0]
            return name && names.includes(name)
              ? { ...process, bundleName: name }
              : process
          }),
        )
        setError(false)
      } catch {
        if (current()) setError(true)
      } finally {
        busy = false
        if (current()) {
          setLoading(false)
          timer = setTimeout(() => void refresh(), 5000)
        }
      }
    }
    refreshRef.current = refresh
    setLoading(false)
    if (active) void refresh()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, active])

  const visibleProcesses = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return processes.filter(
      (process) =>
        (!onlyBundle || process.bundleName) &&
        [process.name, process.pid, process.user].some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(query),
        ),
    )
  }, [processes, onlyBundle, filter])
  const selected = visibleProcesses.find(
    (process) => String(process.pid) === selectedPid,
  )

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const enhance = () => {
      surface.querySelector('.luna-data-grid')?.setAttribute('tabindex', '-1')
      surface
        .querySelectorAll<HTMLElement>('.luna-data-grid-node')
        .forEach((row) => {
          const process = (row as any).dataGridNode?.data
          if (!process) return
          row.tabIndex = 0
          row.dataset.processPid = process.pid
          row.setAttribute('aria-label', `${process.name}, PID ${process.pid}`)
        })
    }
    enhance()
    const observer = new window.MutationObserver(enhance)
    observer.observe(surface, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [visibleProcesses])
  useWindowResize(() => dataGridRef.current?.fit())
  useEffect(() => {
    if (active) dataGridRef.current?.fit()
  }, [active])

  async function stop() {
    const request = confirmation
    setConfirmation(null)
    if (
      !request ||
      actionRef.current ||
      !mounted.current ||
      store.target?.key !== request.key
    )
      return
    actionRef.current = true
    setStopping(true)
    try {
      await main.stopBundle(request.key, request.bundle)
      if (mounted.current && store.target?.key === request.key)
        await refreshRef.current()
    } catch {
      if (mounted.current && store.target?.key === request.key) setError(true)
    } finally {
      if (mounted.current && store.target?.key === request.key) {
        actionRef.current = false
        setStopping(false)
      }
    }
  }

  return (
    <div className={Style.page}>
      <div
        className={Style.surface}
        inert={Boolean(confirmation)}
        aria-hidden={confirmation ? true : undefined}
      >
        <header className={Style.heading}>
          <h1>{t('process')}</h1>
          <p>{t('processDescription')}</p>
        </header>
        <div className={Style.toolbar}>
          <input
            type="search"
            aria-label={t('processSearch')}
            placeholder={t('processSearch')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={onlyBundle}
              onChange={(event) =>
                store.process.set('onlyBundle', event.target.checked)
              }
            />
            {t('onlyBundle')}
          </label>
          <span className={Style.count}>
            {t('totalProcess', { total: visibleProcesses.length })}
          </span>
          <div className={Style.actions}>
            <button
              type="button"
              onClick={() => void refreshRef.current()}
              disabled={!key || loading}
            >
              {t('refresh')}
            </button>
            <button
              type="button"
              className={Style.danger}
              disabled={!key || !selected?.bundleName || stopping}
              onClick={() =>
                setConfirmation({ key: key!, bundle: selected.bundleName })
              }
            >
              {t('stop')}
            </button>
          </div>
        </div>
        {error && (
          <div role="alert" className={Style.error}>
            {t('processLoadError')}
          </div>
        )}
        <div
          className={Style.body}
          aria-busy={loading}
          ref={surfaceRef}
          onKeyDown={(event) => {
            const row = (event.target as HTMLElement).closest<HTMLElement>(
              '[data-process-pid]',
            )
            if (!row) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              row.click()
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const rows = Array.from(
                surfaceRef.current?.querySelectorAll<HTMLElement>(
                  '[data-process-pid]',
                ) || [],
              )
              const next =
                rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)]
              next?.focus()
              next?.click()
              next?.scrollIntoView?.({ block: 'nearest' })
            }
          }}
        >
          <LunaDataGrid
            data={visibleProcesses}
            columns={columns}
            uniqueId="pid"
            selectable={true}
            onSelect={(node) => setSelectedPid(String((node as any).data.pid))}
            onDeselect={() => setSelectedPid(null)}
            onCreate={(grid) => {
              dataGridRef.current = grid
              grid.fit()
            }}
          />
          {!visibleProcesses.length && !error && (
            <div className={Style.empty} role="status">
              {t(
                !key
                  ? 'targetNotConnected'
                  : loading
                    ? 'processLoading'
                    : filter || onlyBundle
                      ? 'processNoResults'
                      : 'processEmpty',
              )}
            </div>
          )}
        </div>
        <footer className={Style.footer}>{t('processPollingHint')}</footer>
      </div>
      <ConfirmDialog
        visible={Boolean(confirmation)}
        title={t('stop')}
        message={t('stopBundleConfirm', { name: confirmation?.bundle || '' })}
        confirmLabel={t('stop')}
        onConfirm={() => void stop()}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  )
})

const columns = [
  {
    id: 'name',
    title: t('processName'),
    sortable: true,
    weight: 30,
  },
  {
    id: '%cpu',
    title: '% CPU',
    sortable: true,
  },
  {
    id: 'time+',
    title: t('cpuTime'),
    sortable: true,
  },
  {
    id: 'res',
    title: t('memory'),
    sortable: true,
    comparator: (a: string, b: string) => fileSize(a) - fileSize(b),
  },
  {
    id: 'pid',
    title: 'PID',
    sortable: true,
  },
  {
    id: 'user',
    title: t('user'),
    sortable: true,
  },
]
