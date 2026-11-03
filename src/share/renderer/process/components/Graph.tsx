import { observer } from 'mobx-react-lite'
import Style from './Graph.module.scss'
import LunaPerformanceMonitor from 'luna-performance-monitor/react'
import store from '../store'
import { t } from '../../../common/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'

export default observer(function Graph() {
  const dataRef = useRef({ cpu: 0, mem: 0 })
  const [error, setError] = useState(false)
  const [hasData, setHasData] = useState(false)
  const refreshRef = useRef<() => void>(() => {})
  const cpuData = useCallback(() => +dataRef.current.cpu.toFixed(1), [])
  const memData = useCallback(
    () => +(dataRef.current.mem / 1024 / 1024).toFixed(2),
    [],
  )
  useEffect(() => {
    let disposed = false,
      pending = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function update() {
      if (disposed || pending) return
      if (timer) clearTimeout(timer)
      timer = null
      pending = true
      try {
        const { cpu, memory } = await main.getCpuAndMem()
        if (disposed) return
        dataRef.current = { cpu, mem: memory }
        setError(false)
        setHasData(true)
      } catch {
        if (!disposed) setError(true)
      } finally {
        pending = false
        if (!disposed) timer = setTimeout(update, 2000)
      }
    }
    refreshRef.current = () => {
      void update()
    }
    void update()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  }, [])
  const color = store.theme === 'dark' ? '#79adff' : '#2469db'
  return (
    <section className={Style.container} aria-label={t('toolMetrics')}>
      {error && (
        <div className={Style.error} role="alert">
          {t('toolMetricsError')}{' '}
          <button type="button" onClick={() => refreshRef.current()}>
            {t('retry')}
          </button>
        </div>
      )}
      {!hasData && !error && <p role="status">{t('toolLoading')}</p>}
      {hasData && (
        <div className={Style.charts}>
          <LunaPerformanceMonitor
            title="CPU"
            data={cpuData}
            theme={store.theme}
            color={color}
            height={56}
            unit="%"
          />
          <LunaPerformanceMonitor
            title={t('memory')}
            data={memData}
            theme={store.theme}
            color={color}
            height={56}
            unit="GB"
          />
        </div>
      )}
    </section>
  )
})
