import Style from './App.module.scss'
import icon from '../../../renderer/assets/icon.png'
import { t } from '../../common/i18n'
import { observer } from 'mobx-react-lite'
import ToolWindow from '../tool-window/ToolWindow'
import store from '../terminal/store'

export default observer(function App() {
  return (
    <ToolWindow theme={store.theme} className={Style.container}>
      <img src={icon} alt="" />
      <h1>{PRODUCT_NAME}</h1>
      <p>{t('aboutDescription')}</p>
      <div>
        {t('version')} {VERSION}
      </div>
    </ToolWindow>
  )
})
