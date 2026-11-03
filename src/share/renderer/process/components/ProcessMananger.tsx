import { observer } from 'mobx-react-lite'
import LunaDataGrid from 'luna-data-grid/react'
import DataGrid from 'luna-data-grid'
import { t } from '../../../common/i18n'
import store from '../store'
import Style from './ProcessManager.module.scss'
import { useEffect, useRef } from 'react'
import { useResizeSensor } from '../../lib/hooks'
import map from 'licia/map'
import fileSize from 'licia/fileSize'

export default observer(function ProcessManager() {
  const dataGridRef = useRef<DataGrid>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useResizeSensor(containerRef, () => dataGridRef.current?.fit())

  useEffect(() => {
    const surface = containerRef.current
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
  }, [])

  const processes = map(store.processes, (process) => {
    return {
      name: process.name,
      pid: process.pid,
      memory: fileSize(process.memory * 1024),
      cpu: process.cpu.toFixed(1),
      type: process.type,
      webContentsId: process.webContentsId,
    }
  })

  return (
    <div
      className={Style.container}
      ref={containerRef}
      onKeyDown={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-process-pid]',
        )
        if (!row) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          row.click()
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const rows = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>(
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
        rowHeight={28}
        className={Style.processes}
        onSelect={(node) => store.select(node.data as any)}
        onDeselect={() => store.select(null)}
        filter={store.filter}
        columns={columns}
        theme={store.theme}
        selectable={true}
        data={processes}
        uniqueId="pid"
        onCreate={(dataGrid) => {
          dataGridRef.current = dataGrid
          dataGrid.fit()
        }}
      />
    </div>
  )
})

const columns = [
  {
    id: 'name',
    title: t('processName'),
    weight: 40,
    sortable: true,
  },
  {
    id: 'type',
    title: t('type'),
    weight: 15,
    sortable: true,
  },
  {
    id: 'memory',
    title: t('memory'),
    comparator: (a: string, b: string) => fileSize(a) - fileSize(b),
    weight: 15,
    sortable: true,
  },
  {
    id: 'cpu',
    title: '% CPU',
    weight: 15,
    sortable: true,
  },
  {
    id: 'pid',
    title: 'PID',
    weight: 15,
    sortable: true,
  },
]
