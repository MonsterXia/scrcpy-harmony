import { makeObservable, observable, runInAction } from 'mobx'
import { setMainStore } from '../../lib/util'
import BaseStore from 'share/renderer/store/BaseStore'
import isStr from 'licia/isStr'
import find from 'licia/find'
import { Settings } from './settings'
import { Application } from './application'
import { ITarget } from 'common/types'
import { setMemStore } from 'share/renderer/lib/util'
import { Process } from './process'
import { Layout } from './layout'

function normalizePanel(panel: string) {
  return [
    'devices',
    'settings',
    'overview',
    'application',
    'process',
    'shell',
    'layout',
    'screenshot',
    'hilog',
    'webview',
  ].includes(panel)
    ? panel
    : 'devices'
}

class Store extends BaseStore {
  targets: ITarget[] = []
  target: ITarget | null = null
  mirrorTarget: ITarget | null = null
  targetsError = false
  discoveryErrors: string[] = []
  panel = 'devices'
  settings = new Settings()
  application = new Application()
  process = new Process()
  layout = new Layout()
  ready = false
  private targetsRefreshId = 0
  constructor() {
    super()

    makeObservable(this, {
      targets: observable,
      target: observable,
      mirrorTarget: observable,
      targetsError: observable,
      discoveryErrors: observable,
      panel: observable,
      ready: observable,
    })

    this.bindEvent()
    this.init()
  }
  selectTarget = (target: string | ITarget | null) => {
    const selected = isStr(target) ? find(this.targets, ({ key }) => key === target) : target
    if (selected === undefined || (selected?.platform && selected.platform !== 'harmony')) return
    this.target = selected
    setMainStore('target', this.target)
  }
  selectMirrorTarget = (target: string | ITarget | null) => {
    const selected = isStr(target) ? find(this.targets, ({ key }) => key === target) : target
    if (selected === undefined) return
    this.mirrorTarget = selected
    setMainStore('mirrorTarget', this.mirrorTarget)
  }
  selectPanel(panel: string) {
    this.panel = normalizePanel(panel)
    setMainStore('panel', this.panel)
  }
  refreshTargets = async () => {
    const refreshId = ++this.targetsRefreshId
    let targets: ITarget[] = []
    let success = true
    let discoveryErrors: string[] = []
    try {
      const result = await main.getDevices()
      targets = result.targets
      discoveryErrors = result.errors
    } catch {
      success = false
    }
    // Only the newest request may publish state or produce a toolbar notice.
    // Older IPC requests still finish; this does not cancel HDC operations.
    if (refreshId !== this.targetsRefreshId) {
      return undefined
    }
    runInAction(() => {
      this.discoveryErrors = discoveryErrors
      this.targets = targets
      this.targetsError = !success
      setMemStore('targets', targets)
    })
    const harmonyTargets = targets.filter(target => !target.platform || target.platform === 'harmony')
    const harmony = harmonyTargets.find(target => target.key === this.target?.key)
    const mirror = targets.find(target => target.key === this.mirrorTarget?.key)
    if (harmony) runInAction(() => { this.target = harmony })
    else if (this.target || harmonyTargets.length) this.selectTarget(harmonyTargets[0] || null)
    if (mirror) runInAction(() => { this.mirrorTarget = mirror })
    else if (this.mirrorTarget || targets.length) this.selectMirrorTarget(targets[0] || null)
    return success
  }
  private async init() {
    const panel = await main.getMainStore('panel')
    if (panel) {
      runInAction(() => (this.panel = normalizePanel(panel)))
    }

    const target = await main.getMainStore('target')
    const mirrorTarget = await main.getMainStore('mirrorTarget')
    runInAction(() => {
      // Migrate an older shared Android/iOS selection to the mirroring scope.
      this.target = target && (!target.platform || target.platform === 'harmony') ? target : null
      this.mirrorTarget = mirrorTarget || target || null
    })
    if (!mirrorTarget && target) this.selectMirrorTarget(target)
    if (target?.platform && target.platform !== 'harmony') setMainStore('target', null)
    await this.refreshTargets()

    this.ready = true
  }
  private bindEvent() {
    main.on('changeTarget', this.refreshTargets)
    // Poll all backends, including USB iOS; refreshes are coalesced in main.
    const poll = async () => {
      await this.refreshTargets()
      setTimeout(() => void poll(), 5000)
    }
    setTimeout(() => void poll(), 5000)
  }
}

export default new Store()
