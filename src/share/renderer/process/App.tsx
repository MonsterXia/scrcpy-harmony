import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import Graph from './components/Graph'
import ProcessMananger from './components/ProcessMananger'
import Toolbar from './components/Toolbar'
import ToolWindow from '../tool-window/ToolWindow'
import { t } from '../../common/i18n'
import store from './store'
import Style from './App.module.scss'

export default observer(function App() {
  useEffect(() => store.start(), [])
  return (
    <ToolWindow
      theme={store.theme}
      title={t('processManager')}
      description={t('toolProcessDescription')}
    >
      <Toolbar />
      {store.error && (
        <div role="alert" className={Style.error}>
          {t('toolProcessLoadError')}{' '}
          <button
            type="button"
            onClick={() => {
              void store.refresh()
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
      <section
        className={Style.table}
        aria-busy={store.loading}
        aria-label={t('processManager')}
      >
        <ProcessMananger />
        {!store.processes.length && (
          <div role="status" className={Style.empty}>
            {t(
              store.loading
                ? 'toolLoading'
                : store.error
                  ? 'toolProcessUnavailable'
                  : 'toolProcessEmpty',
            )}
          </div>
        )}
      </section>
      <Graph />
    </ToolWindow>
  )
})
