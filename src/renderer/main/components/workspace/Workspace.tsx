import { PropsWithChildren } from 'react'
import { observer } from 'mobx-react-lite'
import { t } from 'common/util'
import { notify } from 'share/renderer/lib/util'
import store from '../../store'
import DeviceSwitcher from './DeviceSwitcher'
import useMainFeedback from './useMainFeedback'
import Style from './Workspace.module.scss'

export default observer(function Workspace({
  children,
  onOpenSettings,
}: PropsWithChildren<{ onOpenSettings: () => void }>) {
  useMainFeedback(store.theme)
  const groups = [
    {
      title: t('workspaceDevices'),
      items: [
        { id: 'overview', label: t('overview'), icon: 'phone' },
        { id: 'application', label: t('application'), icon: 'grid' },
        { id: 'screenshot', label: t('screenshot'), icon: 'camera' },
      ],
    },
    {
      title: t('workspaceDebugging'),
      items: [
        { id: 'shell', label: t('shell'), icon: 'terminal' },
        { id: 'hilog', label: t('hilog'), icon: 'list' },
        { id: 'process', label: t('process'), icon: 'processor' },
        { id: 'layout', label: t('layout'), icon: 'debug' },
        { id: 'webview', label: t('webview'), icon: 'browser' },
      ],
    },
  ]
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => item.id === store.panel)
  const currentGroup = groups.find((group) =>
    group.items.some((item) => item.id === store.panel),
  )
  return (
    <div className={Style.workspace} data-theme={store.theme} data-workspace>
      <aside className={Style.sidebar}>
        <div className={Style.brand}>
          <span className={Style.brandMark} aria-hidden="true">
            <span className="icon-screencast" />
          </span>
          <span className={Style.brandName}>{t('workspaceProduct')}</span>
        </div>
        <DeviceSwitcher />
        <nav className={Style.navigation} aria-label={t('workspaceNavigation')}>
          {groups.map((group) => (
            <div className={Style.group} key={group.title}>
              <div className={Style.groupTitle}>{group.title}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={Style.navItem}
                  data-navigation={item.id}
                  aria-current={store.panel === item.id ? 'page' : undefined}
                  aria-controls={`panel-${item.id}`}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => store.selectPanel(item.id)}
                >
                  <span className={`icon-${item.icon}`} aria-hidden="true" />
                  <span className={Style.navLabel}>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className={Style.sidebarFooter}>
          <button
            type="button"
            className={Style.navItem}
            title={t('settings')}
            aria-label={t('settings')}
            data-action="settings"
            aria-current={store.panel === 'settings' ? 'page' : undefined}
            aria-controls="panel-settings"
            onClick={onOpenSettings}
          >
            <span className="icon-setting" aria-hidden="true" />
            <span className={Style.navLabel}>{t('settings')}</span>
          </button>
        </div>
      </aside>
      <main className={Style.main}>
        <header className={Style.topbar}>
          <div className={Style.breadcrumb}>
            <span className={Style.breadcrumbGroup}>
              {store.panel === 'settings'
                ? t('workspaceProduct')
                : currentGroup?.title}
            </span>
            <span className={Style.breadcrumbDivider} aria-hidden="true">
              /
            </span>
            <span className={Style.currentPage}>
              {store.panel === 'settings' ? t('settings') : current?.label}
            </span>
          </div>
          {store.panel !== 'overview' && store.panel !== 'settings' && (
            <button
              className={Style.secondaryButton}
              type="button"
              data-action="screencast"
              disabled={!store.ready || !store.target}
              title={!store.target ? t('targetNotConnected') : t('screencast')}
              onClick={() => {
                void main
                  .showScreencast()
                  .catch(() => notify(t('commonErr'), { icon: 'error' }))
              }}
            >
              <span className="icon-screencast" aria-hidden="true" />
              {t('workspaceStartMirroring')}
            </button>
          )}
        </header>
        <div className={Style.content}>{children}</div>
      </main>
    </div>
  )
})
