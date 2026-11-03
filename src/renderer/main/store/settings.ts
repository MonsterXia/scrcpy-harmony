import { action, makeObservable, observable, runInAction } from 'mobx'
import { resolveLocale } from 'share/common/i18n'

const names = ['language', 'theme', 'hdcPath', 'killHdcWhenExit', 'betaUpdate']
export class Settings {
  language = 'system'
  theme = 'light'
  hdcPath = ''
  killHdcWhenExit = false
  betaUpdate = false
  private revisions = new Map<string, number>()
  constructor() {
    makeObservable(this, {
      language: observable,
      theme: observable,
      hdcPath: observable,
      killHdcWhenExit: observable,
      betaUpdate: observable,
      set: action,
    })
    main.on('changeSettingsStore', (name: string, value: unknown) => {
      if (!names.includes(name)) return
      this.advance(name)
      this.receive(name, value)
    })
    void this.init()
  }
  private advance(name: string) {
    const revision = (this.revisions.get(name) || 0) + 1
    this.revisions.set(name, revision)
    return revision
  }
  private receive(name: string, value: any) {
    if (value === undefined) return
    runInAction(() => {
      this[name] =
        name === 'language' ? resolveLocale(value) || 'system' : value
    })
  }
  async init() {
    await Promise.all(
      names.map(async (name) => {
        const revision = this.revisions.get(name) || 0
        try {
          const value = await main.getSettingsStore(name)
          if ((this.revisions.get(name) || 0) === revision)
            this.receive(name, value)
        } catch {
          /* Keep usable defaults when the initial read fails. Saving still reports errors. */
        }
      }),
    )
  }
  async set(name: string, value: any) {
    if (!names.includes(name)) return
    const revision = this.advance(name)
    await main.setSettingsStore(name, value)
    if (this.revisions.get(name) === revision) this.receive(name, value)
  }
}
