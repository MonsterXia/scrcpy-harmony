import { observer } from 'mobx-react-lite'
import store from './store'
import Overview from './components/overview/Overview'
import Screenshot from './components/screenshot/Screenshot'
import Application from './components/application/Application'
import Process from './components/process/Process'
import Shell from './components/shell/Shell'
import Layout from './components/layout/Layout'
import Webview from './components/webview/Webview'
import Hilog from './components/hilog/Hilog'
import SettingsContent from './components/settings/SettingsContent'
import Workspace from './components/workspace/Workspace'
import Panel from './components/workspace/Panel'
import { PannelLoading } from './components/common/loading'
import useHapDrop from '../lib/useHapDrop'

export default observer(function App() {
  useHapDrop(store.target?.key)
  const openSettings = () => store.selectPanel('settings')
  const panels = [
    {
      id: 'overview',
      content: <Overview onOpenSettings={openSettings} />,
    },
    { id: 'application', content: <Application /> },
    { id: 'process', content: <Process /> },
    { id: 'shell', content: <Shell /> },
    { id: 'layout', content: <Layout /> },
    { id: 'screenshot', content: <Screenshot /> },
    { id: 'hilog', content: <Hilog /> },
    { id: 'webview', content: <Webview /> },
  ]
  return (
    <>
      <Workspace onOpenSettings={openSettings}>
        <Panel id="settings" active={store.panel === 'settings'}>
          <SettingsContent />
        </Panel>
        {store.ready ? (
          <div key={store.target?.key || ''}>
            {panels.map((panel) => (
              <Panel
                key={panel.id}
                id={panel.id}
                active={store.panel === panel.id}
              >
                {panel.content}
              </Panel>
            ))}
          </div>
        ) : store.panel !== 'settings' ? (
          <PannelLoading />
        ) : null}
      </Workspace>
    </>
  )
})
