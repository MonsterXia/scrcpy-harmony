import { t } from 'common/util'
import { observer } from 'mobx-react-lite'
import Style from './PortMappingModal.module.scss'
import LunaDataGrid from 'luna-data-grid/react'
import DataGrid from 'luna-data-grid'
import { useEffect, useRef, useState } from 'react'
import store from '../../store'
import { IModalProps } from 'share/common/types'
import { notify } from 'share/renderer/lib/util'
import { normalizePort } from '../../lib/util'
import WorkspaceDialog from '../workspace/WorkspaceDialog'
import ConfirmDialog from '../workspace/ConfirmDialog'

type PortRow = { local: string; remote: string }
type Session = { active: boolean; read: number }
export default observer(function PortMappingModal(props: IModalProps) {
  const portForwarding = useRef(true)
  const [local, setLocal] = useState(''),
    [remote, setRemote] = useState('')
  const [selected, setSelected] = useState<PortRow | null>(null)
  const [data, setData] = useState<PortRow[]>([])
  const [loading, setLoading] = useState(false),
    [writing, setWriting] = useState(false),
    [error, setError] = useState(false)
  const [confirmation, setConfirmation] = useState<{
    row: PortRow
    forwarding: boolean
    key: string
    session: Session
    read: number
  } | null>(null)
  const connectKey = store.target?.key
  const { visible } = props
  const refresh = useRef<() => Promise<void>>(async () => {})
  const session = useRef<Session | null>(null)
  const writeLock = useRef(false)
  const grid = useRef<DataGrid>(null)
  useEffect(() => {
    const current = { active: true, read: 0 }
    session.current = current
    function clear() {
      setData([])
      setSelected(null)
    }
    refresh.current = async () => {
      if (
        !current.active ||
        !visible ||
        !connectKey ||
        store.target?.key !== connectKey
      )
        return
      const id = ++current.read,
        forwarding = portForwarding.current
      const isCurrent = () =>
        current.active &&
        id === current.read &&
        store.target?.key === connectKey &&
        portForwarding.current === forwarding
      clear()
      setConfirmation(null)
      setLoading(true)
      setError(false)
      try {
        const rows = forwarding
          ? await main.listForwards(connectKey)
          : await main.listReverses(connectKey)
        if (isCurrent()) setData(rows)
      } catch {
        if (isCurrent()) {
          clear()
          setError(true)
          notify(t('commonErr'), { icon: 'error' })
        }
      } finally {
        if (isCurrent()) setLoading(false)
      }
    }
    clear()
    setConfirmation(null)
    setError(false)
    setLoading(false)
    setWriting(false)
    writeLock.current = false
    refresh.current()
    return () => {
      current.active = false
    }
  }, [connectKey, visible])
  useEffect(() => {
    const nodes = grid.current?.nodes || []
    for (const node of nodes) {
      node.container.tabIndex = 0
      node.container.setAttribute(
        'aria-label',
        `${node.data.local} → ${node.data.remote}`,
      )
    }
  }, [data])
  async function write(remove = false, confirmed = confirmation) {
    const current = session.current,
      key = connectKey,
      forwarding = portForwarding.current
    if (
      !visible ||
      !key ||
      !current?.active ||
      writeLock.current ||
      store.target?.key !== key
    )
      return
    if (
      remove &&
      (!confirmed ||
        confirmed.session !== current ||
        confirmed.read !== current.read ||
        confirmed.key !== key ||
        confirmed.forwarding !== forwarding)
    )
      return
    if (!remove && (!local.trim() || !remote.trim())) return
    const row = remove
      ? confirmed!.row
      : { local: normalizePort(local), remote: normalizePort(remote) }
    const refreshAfterWrite = refresh.current
    writeLock.current = true
    setWriting(true)
    setConfirmation(null)
    try {
      if (remove) {
        if (forwarding) await main.removeForward(key, row.local, row.remote)
        else await main.removeReverse(key, row.remote, row.local)
      } else {
        if (forwarding) await main.forward(key, row.local, row.remote)
        else await main.reverse(key, row.remote, row.local)
      }
      await refreshAfterWrite()
    } catch {
      if (
        current.active &&
        session.current === current &&
        store.target?.key === key
      ) {
        setError(true)
        notify(t('commonErr'), { icon: 'error' })
      }
    } finally {
      if (current.active && session.current === current) {
        writeLock.current = false
        setWriting(false)
      }
    }
  }
  return (
    <WorkspaceDialog
      title={t('portMapping')}
      visible={visible}
      onClose={props.onClose}
      wide
    >
      <div className={Style.container}>
        <div inert={!!confirmation}>
          <p className={Style.hint}>{t('workspacePortDialogHint')}</p>
          <form
            className={Style.form}
            onSubmit={(e) => {
              e.preventDefault()
              void write()
            }}
          >
            <label>
              {t('workspacePortDirection')}
              <select
                data-port-direction
                value={portForwarding.current ? 'forward' : 'reverse'}
                disabled={writing || !connectKey}
                onChange={(e) => {
                  portForwarding.current = e.target.value === 'forward'
                  void refresh.current()
                }}
              >
                <option value="forward">{t('portForwarding')}</option>
                <option value="reverse">{t('portReversing')}</option>
              </select>
            </label>
            <label>
              {t('local')}
              <input
                data-port-input="local"
                value={local}
                placeholder={t('workspacePortPlaceholder')}
                disabled={writing || !connectKey}
                onChange={(e) => setLocal(e.target.value)}
              />
            </label>
            <label>
              {t('remote')}
              <input
                data-port-input="remote"
                value={remote}
                placeholder={t('workspacePortPlaceholder')}
                disabled={writing || !connectKey}
                onChange={(e) => setRemote(e.target.value)}
              />
            </label>
            <button
              type="submit"
              data-action="add"
              disabled={
                writing || !connectKey || !local.trim() || !remote.trim()
              }
            >
              {t('add')}
            </button>
          </form>
          <div className={Style.actions}>
            <span role="status">
              {loading
                ? t('workspaceLoading')
                : t('workspacePortCount', { total: data.length })}
            </span>
            <button
              type="button"
              data-action="delete"
              disabled={writing || !connectKey || !selected}
              onClick={() => {
                if (selected && connectKey && session.current)
                  setConfirmation({
                    row: selected,
                    forwarding: portForwarding.current,
                    key: connectKey,
                    session: session.current,
                    read: session.current.read,
                  })
              }}
            >
              {t('delete')}
            </button>
            <button
              type="button"
              data-action="refresh"
              disabled={writing || !connectKey}
              aria-busy={loading}
              onClick={() => void refresh.current()}
            >
              {t('refresh')}
            </button>
          </div>
          {error && (
            <p role="alert" className={Style.error}>
              {t('workspacePortFailed')}
            </p>
          )}
          {!connectKey && (
            <p className={Style.hint}>{t('targetNotConnected')}</p>
          )}
          <div
            className={Style.grid}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              const node = grid.current?.nodes.find(
                (node) => node.container === event.target,
              )
              if (node) {
                event.preventDefault()
                grid.current?.selectSingle(node)
              }
            }}
          >
            <LunaDataGrid
              onSelect={(node) => setSelected(node.data)}
              onDeselect={() => setSelected(null)}
              onCreate={(instance) => {
                grid.current = instance
              }}
              data={data}
              minHeight={220}
              maxHeight={220}
              selectable
              columns={columns}
            />
          </div>
          {!loading && !error && connectKey && !data.length && (
            <p className={Style.empty}>{t('workspaceNoPorts')}</p>
          )}
        </div>
        <ConfirmDialog
          visible={!!confirmation}
          title={t('delete')}
          message={t('workspaceDeletePort', {
            local: confirmation?.row.local || '',
            remote: confirmation?.row.remote || '',
          })}
          confirmLabel={t('delete')}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void write(true)}
        />
      </div>
    </WorkspaceDialog>
  )
})
const columns = [
  { id: 'local', title: t('local'), sortable: true },
  { id: 'remote', title: t('remote'), sortable: true },
]
