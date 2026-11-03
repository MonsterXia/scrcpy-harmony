import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import store from '../../store'
import map from 'licia/map'
import LunaIconList from 'luna-icon-list/react'
import defaultIcon from '../../../assets/default-icon.png'
import { t } from 'common/util'
import { IBundleInfo } from 'common/types'
import chunk from 'licia/chunk'
import concat from 'licia/concat'
import Style from './Application.module.scss'
import { PannelLoading } from '../common/loading'
import find from 'licia/find'
import BundleInfoModal from './BundleInfoModal'
import type { BundleAction } from './ApplicationActions'
import LunaDataGrid from 'luna-data-grid/react'
import toEl from 'licia/toEl'
import escape from 'licia/escape'
import dateFormat from 'licia/dateFormat'
import contextMenu from 'share/renderer/lib/contextMenu'
import ConfirmDialog from '../workspace/ConfirmDialog'
import className from 'licia/className'
import { isFileDrop, notify } from 'share/renderer/lib/util'
import { installBundles } from '../../../lib/util'
import DataGrid from 'luna-data-grid'
import { useWindowResize } from 'share/renderer/lib/hooks'

export default observer(function Application() {
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const actionLock = useRef(false)
  const actionEpoch = useRef(0)
  const [confirmation, setConfirmation] = useState<{
    title: string
    message: string
  } | null>(null)
  const confirmationResolve = useRef<((accepted: boolean) => void) | null>(null)
  const applicationsRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const detailsBundle = useRef('')
  const detailsOpener = useRef<HTMLElement | null>(null)
  const [bundleInfo, setBundleInfo] = useState<IBundleInfo | null>(null)
  const [bundleInfos, setBundleInfos] = useState<IBundleInfo[]>([])
  const [filter, setFilter] = useState('')
  const [dropHighlight, setDropHighlight] = useState(false)
  const dataGridRef = useRef<DataGrid>(null)
  const [bundleInfoModalVisible, setBundleInfoModalVisible] = useState(false)
  const [isOpenEffectAnimating, setIsOpenEffectAnimating] = useState(false)
  const [openEffectStyle, setOpenEffectStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })
  const draggingRef = useRef(0)
  const iconsRef = useRef<any[]>([])
  const refreshRef = useRef<{
    active: boolean
    running: boolean
    pending: boolean
  } | null>(null)

  const { target } = store

  useEffect(() => {
    const state = { active: true, running: false, pending: false }
    refreshRef.current = state
    refresh()
    const offInstalled = main.on('bundleInstalled', (connectKey: string) => {
      if (connectKey === target?.key) void refresh()
    })
    return () => {
      confirmationResolve.current?.(false)
      confirmationResolve.current = null
      actionEpoch.current++
      state.active = false
      state.pending = false
      offInstalled()
    }
  }, [target?.key])
  useWindowResize(() => dataGridRef.current?.fit())

  async function refresh() {
    const state = refreshRef.current
    if (!target || !state?.active || store.target?.key !== target.key) {
      return
    }

    // React state is for display; old install/menu closures must share this lock.
    finishConfirmation(false)
    actionEpoch.current++
    setBundleInfoModalVisible(false)
    state.pending = true
    if (state.running) {
      return
    }
    state.running = true
    const isCurrent = () =>
      state.active &&
      refreshRef.current === state &&
      store.target?.key === target.key

    setIsLoading(true)
    try {
      while (state.pending && isCurrent()) {
        state.pending = false
        setLoadError(false)
        iconsRef.current = []
        setBundleInfos([])
        try {
          const bundles = await main.getBundles(
            target.key,
            store.application.sysBundle,
          )
          if (!isCurrent()) return
          const chunks = chunk(bundles, 5)
          let bundleInfos: IBundleInfo[] = []
          for (let i = 0, len = chunks.length; i < len; i++) {
            const chunk: string[] = chunks[i]
            const infos = await main.getBundleInfos(target.key, chunk)
            if (!isCurrent()) return
            bundleInfos = concat(bundleInfos, infos)
            iconsRef.current = map(bundleInfos, (info) => ({
              info,
              src: escape(info.icon || defaultIcon),
              name: escape(info.label),
              style: { borderRadius: '20%' },
            }))
            setBundleInfos(bundleInfos)
          }
        } catch {
          if (isCurrent()) {
            setLoadError(true)
            notify(t('commonErr'), { icon: 'error' })
          }
        }
      }
    } finally {
      state.running = false
      if (isCurrent()) setIsLoading(false)
    }
  }

  function onDrop() {
    draggingRef.current = 0
    setDropHighlight(false)
  }

  async function install(hapPaths?: string[]) {
    await installBundles(target!.key, hapPaths)
  }

  function showInfo(bunldeName: string, opener?: HTMLElement) {
    const bundleInfo = find(
      bundleInfos,
      (info) => info.bundleName === bunldeName,
    )
    if (bundleInfo) {
      detailsBundle.current = bundleInfo.bundleName
      detailsOpener.current =
        opener || (document.activeElement as HTMLElement | null)
      if (opener) {
        opener.tabIndex = 0
        opener.focus()
      }
      setBundleInfo(bundleInfo)
      setBundleInfoModalVisible(true)
    }
  }

  function finishConfirmation(accepted: boolean) {
    const resolve = confirmationResolve.current
    confirmationResolve.current = null
    setConfirmation(null)
    resolve?.(accepted)
  }

  async function runAction(action: BundleAction, info: IBundleInfo) {
    const state = refreshRef.current
    const connectKey = target?.key
    const epoch = actionEpoch.current
    const isCurrent = () =>
      Boolean(
        connectKey &&
        state?.active &&
        refreshRef.current === state &&
        store.target?.key === connectKey &&
        actionEpoch.current === epoch,
      )
    if (!isCurrent() || actionLock.current) return
    actionLock.current = true
    setActionBusy(true)
    try {
      if (action !== 'open') {
        const messages = {
          stop: t('stopBundleConfirm', { name: info.label }),
          cleanCache: t('cleanCacheConfirm', { name: info.label }),
          cleanData: t('cleanDataConfirm', { name: info.label }),
          uninstall: t('uninstallConfirm', { name: info.label }),
        }
        const confirmed = await new Promise<boolean>((resolve) => {
          confirmationResolve.current = resolve
          setConfirmation({ title: labels[action], message: messages[action] })
        })
        if (!confirmed || !isCurrent()) return
      }
      if (action === 'open' && info.mainAbility)
        await main.startBundle(connectKey!, info.bundleName, info.mainAbility)
      if (action === 'stop') await main.stopBundle(connectKey!, info.bundleName)
      if (action === 'cleanCache')
        await main.cleanBundleCache(connectKey!, info.bundleName)
      if (action === 'cleanData')
        await main.cleanBundleData(connectKey!, info.bundleName)
      if (action === 'uninstall')
        await main.uninstallBundle(connectKey!, info.bundleName)
      if (!isCurrent()) return
      if (action === 'cleanCache' || action === 'cleanData')
        notify(t(action === 'cleanCache' ? 'cacheCleaned' : 'dataCleaned'), {
          icon: 'success',
        })
      if (action === 'uninstall') void refresh()
    } catch {
      if (isCurrent()) notify(t('commonErr'), { icon: 'error' })
    } finally {
      actionLock.current = false
      if (state?.active && refreshRef.current === state) setActionBusy(false)
    }
  }

  const labels = {
    open: t('open'),
    stop: t('stop'),
    cleanCache: t('cleanCache'),
    cleanData: t('cleanData'),
    uninstall: t('uninstall'),
  }

  function onContextMenu(e: PointerEvent, info: IBundleInfo) {
    const epoch = actionEpoch.current
    const current = () =>
      epoch === actionEpoch.current &&
      store.target?.key === target?.key &&
      refreshRef.current?.active

    const template: any[] = [
      {
        label: t('bundleInfo'),
        click: () => {
          if (current()) showInfo(info.bundleName)
        },
      },
      { type: 'separator' },
      ...(
        [
          'open',
          'stop',
          'cleanCache',
          'cleanData',
          'uninstall',
        ] as BundleAction[]
      ).map((action) => ({
        label: labels[action],
        enabled:
          !actionLock.current &&
          (action !== 'open' || Boolean(info.mainAbility)),
        click: () => {
          if (current()) return runAction(action, info)
        },
      })),
    ]
    contextMenu(e, template)
  }

  const query = filter.trim().toLowerCase()
  const matches = useCallback(
    (info: IBundleInfo) =>
      [info.label, info.bundleName].some((value) =>
        value.toLowerCase().includes(query),
      ),
    [query],
  )
  const filteredInfos = useMemo(
    () => bundleInfos.filter(matches),
    [bundleInfos, matches],
  )
  const gridData = useMemo(
    () =>
      map(filteredInfos, (info: IBundleInfo) => ({
        info,
        label: toEl(
          `<span><img src="${escape(info.icon || defaultIcon)}" />${escape(info.label)}</span>`,
        ),
        bundleName: info.bundleName,
        versionName: info.versionName,
        vendor: info.vendor,
        apiTargetVersion: info.apiTargetVersion,
        installTime: dateFormat(
          new Date(info.installTime),
          'yyyy-mm-dd HH:MM:ss',
        ),
        releaseType: info.releaseType,
      })),
    [filteredInfos],
  )
  const iconFilter = useCallback(
    (icon: any) => matches(icon.data.info),
    [matches],
  )
  const restoreDetailsFocus = useCallback(() => {
    const items = Array.from(
      applicationsRef.current?.querySelectorAll<HTMLElement>(
        '[data-application-item]',
      ) || [],
    )
    const current = items.find(
      (item) => item.dataset.applicationItem === detailsBundle.current,
    )
    const opener =
      current ||
      (detailsOpener.current?.isConnected
        ? detailsOpener.current
        : searchRef.current)
    if (!opener?.closest('[inert]')) opener?.focus()
  }, [])
  useEffect(() => {
    const surface = applicationsRef.current
    if (!surface) return
    const enhance = () => {
      surface.querySelector('.luna-data-grid')?.setAttribute('tabindex', '-1')
      surface
        .querySelectorAll<HTMLElement>(
          '.luna-data-grid-node, .luna-icon-list-item',
        )
        .forEach((item) => {
          const info =
            (item as any).dataGridNode?.data.info ||
            (item as any).icon?.data.info
          if (!info) return
          item.tabIndex = 0
          item.dataset.applicationItem = info.bundleName
          item.setAttribute('aria-label', `${info.label}, ${info.bundleName}`)
          if ((item as any).icon) item.setAttribute('role', 'button')
        })
    }
    enhance()
    const observer = new window.MutationObserver(enhance)
    observer.observe(surface, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isLoading, filteredInfos, store.application.listView])
  const applications = (
    <div
      className={Style.applications}
      ref={applicationsRef}
      onKeyDown={(event) => {
        const item = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-application-item]',
        )
        if (!item) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          showInfo(item.dataset.applicationItem!, item)
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const items = Array.from(
            applicationsRef.current?.querySelectorAll<HTMLElement>(
              '[data-application-item]',
            ) || [],
          )
          const next =
            items[items.indexOf(item) + (event.key === 'ArrowDown' ? 1 : -1)]
          next?.focus()
          next?.scrollIntoView?.({ block: 'nearest' })
        }
      }}
      style={{
        overflowY: store.application.listView ? 'hidden' : 'auto',
      }}
      onDrop={onDrop}
      onErrorCapture={(event) => {
        const image = event.target as HTMLImageElement
        if (
          image.tagName === 'IMG' &&
          image.getAttribute('src') !== defaultIcon
        )
          image.src = defaultIcon
      }}
      onMouseOver={(e) => {
        // Luna interprets name as HTML but escapes it again for the tooltip.
        // Restore the literal rendered text before displaying that tooltip.
        const name = (e.target as HTMLElement).closest('.luna-icon-list-name')
        if (name) {
          const text = name.querySelector('.luna-icon-list-name-wrapper')
          name.setAttribute('title', text?.textContent || '')
        }
      }}
      onDragEnter={() => {
        draggingRef.current++
      }}
      onDragLeave={() => {
        draggingRef.current--
        if (draggingRef.current === 0) {
          setDropHighlight(false)
        }
      }}
      onDragOver={(e) => {
        if (!isFileDrop(e)) {
          return
        }
        e.preventDefault()
        setDropHighlight(true)
      }}
    >
      {store.application.listView ? (
        <LunaDataGrid
          onClick={(e: any, node) => {
            showInfo((node.data as any).bundleName, node.container)
          }}
          onDoubleClick={(e: any, node) => {
            const info = (node.data as any).info
            if (info.mainAbility) {
              void runAction('open', info)
            }
          }}
          onContextMenu={(e: any, node) => {
            onContextMenu(e, (node.data as any).info)
          }}
          filter=""
          columns={columns}
          data={gridData}
          selectable={true}
          uniqueId="bundleName"
          onCreate={(dataGrid) => {
            dataGridRef.current = dataGrid
            dataGrid.fit()
          }}
        />
      ) : (
        <LunaIconList
          icons={iconsRef.current}
          size={store.application.itemSize}
          filter={iconFilter}
          onClick={(e: any, icon) => {
            const info = (icon.data as any).info
            showInfo(info.bundleName, icon.container)
          }}
          onDoubleClick={(e: any, icon) => {
            const info = (icon.data as any).info
            if (!info.mainAbility) {
              return
            }
            const container: HTMLElement = icon.container
            const clientRect = container.getBoundingClientRect()
            setOpenEffectStyle({
              left: clientRect.left,
              top: clientRect.top - 60,
              width: clientRect.width,
              height: clientRect.width,
            })
            void runAction('open', info)
            setIsOpenEffectAnimating(true)
          }}
          onContextMenu={(e: any, icon) => {
            onContextMenu(e, (icon.data as any).info)
          }}
        />
      )}
      <div
        className={className({
          [Style.openEffect]: true,
          [Style.openEffectAnimation]: isOpenEffectAnimating,
        })}
        style={openEffectStyle}
        onAnimationEnd={() => setIsOpenEffectAnimating(false)}
      />
    </div>
  )

  return (
    <div className={Style.page} data-application>
      <div
        className={Style.surface}
        inert={bundleInfoModalVisible || Boolean(confirmation)}
        aria-hidden={
          bundleInfoModalVisible || Boolean(confirmation) || undefined
        }
      >
        <header className={Style.heading}>
          <div>
            <h1>{t('application')}</h1>
            <p>{t('applicationDescription')}</p>
          </div>
          <button
            type="button"
            className={Style.primary}
            data-action="add"
            disabled={!target}
            onClick={() => void install()}
          >
            <span className="icon-add" aria-hidden="true" />
            {t('install')}
          </button>
        </header>
        <div className={Style.toolbar}>
          <input
            type="search"
            ref={searchRef}
            aria-label={t('applicationSearch')}
            placeholder={t('applicationSearch')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <label className={Style.checkbox}>
            <input
              type="checkbox"
              data-action="system"
              checked={store.application.sysBundle}
              disabled={isLoading || !target}
              onChange={(event) => {
                store.application.set('sysBundle', event.target.checked)
                void refresh()
              }}
            />
            {t('sysBundle')}
          </label>
          <span className={Style.count} data-application-count>
            {t('totalBundle', { total: filteredInfos.length })}
          </span>
          <div className={Style.controls}>
            <button
              type="button"
              title={t('zoomOut')}
              aria-label={t('zoomOut')}
              disabled={
                store.application.listView ||
                store.application.itemSize < 32 ||
                !bundleInfos.length
              }
              onClick={() =>
                store.application.set(
                  'itemSize',
                  Math.round(store.application.itemSize * 0.8),
                )
              }
            >
              <span className="icon-zoom-out" aria-hidden="true" />
            </button>
            <button
              type="button"
              title={t('zoomIn')}
              aria-label={t('zoomIn')}
              disabled={
                store.application.listView ||
                store.application.itemSize > 256 ||
                !bundleInfos.length
              }
              onClick={() =>
                store.application.set(
                  'itemSize',
                  Math.round(store.application.itemSize * 1.2),
                )
              }
            >
              <span className="icon-zoom-in" aria-hidden="true" />
            </button>
            <button
              type="button"
              title={t('iconView')}
              data-action="grid-view"
              aria-label={t('iconView')}
              aria-pressed={!store.application.listView}
              onClick={() => store.application.set('listView', false)}
            >
              <span className="icon-grid" aria-hidden="true" />
            </button>
            <button
              type="button"
              title={t('listView')}
              data-action="list-view"
              aria-label={t('listView')}
              aria-pressed={store.application.listView}
              onClick={() => store.application.set('listView', true)}
            >
              <span className="icon-list" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-action="refresh"
              title={t('refresh')}
              aria-label={t('refresh')}
              disabled={isLoading || !target}
              onClick={() => void refresh()}
            >
              <span className="icon-refresh" aria-hidden="true" />
            </button>
          </div>
        </div>
        {loadError && (
          <div role="alert" className={Style.error}>
            <span>
              {t(
                bundleInfos.length
                  ? 'applicationPartialError'
                  : 'applicationLoadError',
              )}
            </span>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void refresh()}
            >
              {t('refresh')}
            </button>
          </div>
        )}
        <div
          className={className(Style.body, {
            [Style.highlight]: dropHighlight,
          })}
          aria-busy={isLoading}
        >
          {isLoading && !bundleInfos.length ? <PannelLoading /> : applications}
          {!isLoading && !filteredInfos.length && !loadError && (
            <div className={Style.empty}>
              <span
                className={target ? 'icon-grid' : 'icon-phone'}
                aria-hidden="true"
              />
              <h2>
                {t(
                  !target
                    ? 'targetNotConnected'
                    : query
                      ? 'applicationNoResults'
                      : 'applicationEmpty',
                )}
              </h2>
              <p>
                {t(
                  !target
                    ? 'workspaceConnectToStart'
                    : query
                      ? 'applicationSearchHint'
                      : 'applicationInstallHint',
                )}
              </p>
            </div>
          )}
          {isLoading && bundleInfos.length > 0 && (
            <div className={Style.progress} role="status">
              {t('applicationLoadingMore')}
            </div>
          )}
        </div>
        <footer className={Style.footer}>{t('applicationDropHint')}</footer>
      </div>
      {bundleInfo && (
        <BundleInfoModal
          bundleInfo={bundleInfo}
          visible={bundleInfoModalVisible}
          busy={actionBusy}
          returnFocus={detailsOpener.current}
          restoreFocus={restoreDetailsFocus}
          suspended={Boolean(confirmation)}
          onAction={(action) => void runAction(action, bundleInfo)}
          onClose={() => setBundleInfoModalVisible(false)}
        />
      )}
      <ConfirmDialog
        visible={Boolean(confirmation)}
        title={confirmation?.title || ''}
        message={confirmation?.message || ''}
        confirmLabel={confirmation?.title}
        onConfirm={() => finishConfirmation(true)}
        onCancel={() => finishConfirmation(false)}
      />
    </div>
  )
})

const columns = [
  {
    id: 'label',
    title: t('name'),
    sortable: true,
    weight: 20,
  },
  {
    id: 'bundleName',
    title: t('bundleName'),
    sortable: true,
    weight: 20,
  },
  {
    id: 'versionName',
    title: t('version'),
    sortable: true,
    weight: 10,
  },
  {
    id: 'vendor',
    title: t('vendor'),
    sortable: true,
    weight: 10,
  },
  {
    id: 'apiTargetVersion',
    title: t('apiTargetVersion'),
    sortable: true,
    weight: 15,
  },
  {
    id: 'installTime',
    title: t('installTime'),
    sortable: true,
    weight: 15,
  },
  {
    id: 'releaseType',
    title: t('releaseType'),
    sortable: true,
    weight: 10,
  },
]
