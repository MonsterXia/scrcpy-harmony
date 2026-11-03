import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import types from 'licia/types'
import copy from 'licia/copy'
import fileSize from 'licia/fileSize'
import { notify } from 'share/renderer/lib/util'
import { t } from 'common/util'
import store from '../../store'
import { PannelLoading } from '../common/loading'
import PortMappingModal from './PortMappingModal'
import RemoteControllerModal from './RemoteControllerModal'
import Style from './Overview.module.scss'

export default observer(function Overview({
  onOpenSettings,
}: {
  onOpenSettings?: () => void
}) {
  const [portModalVisible, setPortModalVisible] = useState(false)
  const [remoteControllerModalVisible, setRemoteControllerModalVisible] =
    useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const detectingRef = useRef(false)
  const [overview, setOverview] = useState<types.PlainObj<string | number>>({})
  const readSession = useRef<{ active: boolean; pending: boolean } | null>(null)
  const { target } = store

  useEffect(() => {
    const session = { active: true, pending: false }
    readSession.current = session
    setOverview({})
    setIsLoading(false)
    setFailed(false)
    void refresh()
    return () => {
      session.active = false
    }
  }, [target])

  async function refresh() {
    const session = readSession.current
    if (!target || !session?.active || session.pending) return
    const isCurrent = () => session.active && store.target === target
    if (!isCurrent()) return
    session.pending = true
    setIsLoading(true)
    setFailed(false)
    try {
      const result = await main.getOverview(target.key)
      if (isCurrent()) setOverview(result)
    } catch {
      if (isCurrent()) {
        setOverview({})
        setFailed(true)
        notify(t('commonErr'), { icon: 'error' })
      }
    } finally {
      session.pending = false
      if (isCurrent()) setIsLoading(false)
    }
  }

  async function detectDevices() {
    if (detectingRef.current) return
    const session = readSession.current
    detectingRef.current = true
    setDetecting(true)
    try {
      await store.refreshTargets()
    } catch {
      if (session?.active) notify(t('targetRefreshFailed'), { icon: 'error' })
    } finally {
      detectingRef.current = false
      if (session?.active) setDetecting(false)
    }
  }

  async function runTool(action: () => unknown) {
    try {
      await action()
    } catch {
      notify(t('commonErr'), { icon: 'error' })
    }
  }

  const hasDetails = Object.keys(overview).length > 0
  const memory =
    typeof overview.memTotal === 'number' &&
    Number.isFinite(overview.memTotal) &&
    overview.memTotal > 0
      ? fileSize(overview.memTotal)
      : undefined
  const processor = overview.processor
    ? `${overview.processor}${overview.abi ? ` (${overview.abi})` : ''}`
    : overview.abi

  return (
    <div className={Style.container}>
      <header className={Style.heading}>
        <div>
          <h1>{t('overview')}</h1>
          <p>{t('workspaceOverviewDescription')}</p>
        </div>
        <button
          type="button"
          className={Style.primary}
          disabled={!target}
          title={!target ? t('targetNotConnected') : t('screencast')}
          onClick={() => {
            void runTool(() => main.showScreencast())
          }}
        >
          <span className="icon-screencast" aria-hidden="true" />
          {t('workspaceStartMirroring')}
        </button>
      </header>
      {!target ? (
        <div className={Style.empty}>
          <span className="icon-phone" aria-hidden="true" />
          <h2>
            {t(
              store.targetsError
                ? 'workspaceConnectionError'
                : 'targetNotConnected',
            )}
          </h2>
          <p role={store.targetsError ? 'alert' : undefined}>
            {t(
              store.targetsError
                ? 'targetRefreshFailed'
                : 'workspaceConnectHint',
            )}
          </p>
          <div className={Style.emptyActions}>
            <button
              type="button"
              className={Style.primary}
              disabled={detecting}
              onClick={() => {
                void detectDevices()
              }}
            >
              {t(detecting ? 'workspaceRefreshing' : 'workspaceDetectDevices')}
            </button>
            {onOpenSettings && (
              <button
                type="button"
                className={Style.button}
                onClick={onOpenSettings}
              >
                {t('settings')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <section className={Style.hero}>
            <div className={Style.phone} aria-hidden="true">
              <span className="icon-ohos" />
            </div>
            <div className={Style.identity}>
              <p className={Style.eyebrow}>{t('workspaceCurrentDevice')}</p>
              <h2>{overview.name || target.name || t('unknown')}</h2>
              <p className={Style.deviceModel}>
                {[overview.brand, overview.model].filter(Boolean).join(' · ') ||
                  t('unknown')}
              </p>
              <span className={Style.status}>{t('workspaceConnected')}</span>
            </div>
            <button
              type="button"
              className={Style.button}
              data-action="refresh"
              aria-label={t('refresh')}
              disabled={isLoading}
              onClick={() => {
                void refresh()
              }}
            >
              <span className="icon-refresh" aria-hidden="true" />
              {t(isLoading ? 'workspaceRefreshing' : 'refresh')}
            </button>
          </section>
          {failed && (
            <div className={Style.error} role="alert">
              <span>{t('workspaceOverviewFailed')}</span>
              <button
                type="button"
                className={Style.button}
                onClick={() => {
                  void refresh()
                }}
              >
                {t('refresh')}
              </button>
            </div>
          )}
          {isLoading && !hasDetails ? (
            <div className={Style.loading}>
              <PannelLoading />
            </div>
          ) : (
            <section aria-busy={isLoading}>
              <h2 className={Style.sectionTitle}>
                {t('workspaceDeviceInformation')}
              </h2>
              <div className={Style.infoGrid}>
                <div className={Style.infoBlock}>
                  <h3>
                    <span className="icon-ohos" aria-hidden="true" />
                    {t('workspaceSystem')}
                  </h3>
                  {item(
                    t('ohosVersion'),
                    target.ohosVersion
                      ? `OpenHarmony ${target.ohosVersion}${target.sdkVersion ? ` (API ${target.sdkVersion})` : ''}`
                      : undefined,
                    'ohosVersion',
                  )}
                  {item(
                    t('kernelVersion'),
                    overview.kernelVersion,
                    'kernelVersion',
                  )}
                  {item(t('serialNum'), overview.serialNum, 'serialNum')}
                  {item(t('name'), overview.name, 'name')}
                </div>
                <div className={Style.infoBlock}>
                  <h3>
                    <span className="icon-processor" aria-hidden="true" />
                    {t('workspaceHardware')}
                  </h3>
                  {item(t('processor'), processor, 'processor')}
                  {item(
                    t('physicalResolution'),
                    overview.physicalResolution,
                    'physicalResolution',
                  )}
                  {item(t('memory'), memory, 'memory')}
                  {item(t('brand'), overview.brand, 'brand')}
                  {item(t('model'), overview.model, 'model')}
                </div>
              </div>
            </section>
          )}
        </>
      )}
      <h2 className={Style.sectionTitle}>{t('workspaceDeviceTools')}</h2>
      <div className={Style.tools}>
        <button
          type="button"
          disabled={!target}
          onClick={() => setPortModalVisible(true)}
        >
          <span className="icon-bidirection" aria-hidden="true" />
          <span>
            <strong>{t('portMapping')}</strong>
            <small>{t('workspacePortHint')}</small>
          </span>
        </button>
        <button
          type="button"
          disabled={!target}
          onClick={() => setRemoteControllerModalVisible(true)}
        >
          <span className="icon-remote-controller" aria-hidden="true" />
          <span>
            <strong>{t('remoteController')}</strong>
            <small>{t('workspaceRemoteHint')}</small>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            void runTool(() => main.openHdcCli())
          }}
        >
          <span className="icon-terminal" aria-hidden="true" />
          <span>
            <strong>{t('hdcCli')}</strong>
            <small>{t('workspaceCliHint')}</small>
          </span>
        </button>
      </div>
      <PortMappingModal
        visible={portModalVisible}
        onClose={() => setPortModalVisible(false)}
      />
      <RemoteControllerModal
        visible={remoteControllerModalVisible}
        onClose={() => setRemoteControllerModalVisible(false)}
      />
    </div>
  )
})

function item(
  title: string,
  value: string | number | undefined,
  field: string,
) {
  const available = value !== undefined && value !== null && value !== ''
  const text = available ? String(value) : t('unknown')
  return (
    <button
      type="button"
      className={Style.infoItem}
      disabled={!available}
      title={
        available
          ? t('workspaceCopyValue', { name: title, value: text })
          : title
      }
      onClick={() => {
        copy(text)
        notify(t('copied'), { icon: 'info' })
      }}
    >
      <span>{title}</span>
      <span data-overview-field={field}>{text}</span>
    </button>
  )
}
