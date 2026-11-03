import BaseStore from '../store/BaseStore'
import { IProcess } from '../../common/types'
import { action, makeObservable, observable, runInAction } from 'mobx'

class Store extends BaseStore {
  processes: IProcess[] = []
  process: IProcess | null = null
  filter = ''
  error = false
  loading = false
  private generation = 0
  private request = 0
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null
  constructor() {
    super()
    makeObservable(this, {
      processes: observable,
      process: observable,
      filter: observable,
      error: observable,
      loading: observable,
      setFilter: action,
      select: action,
    })
  }
  select(process: IProcess | null) {
    this.process = process
  }
  setFilter(filter: string) {
    this.filter = filter
  }
  start() {
    this.stop()
    this.running = true
    const generation = this.generation
    const poll = async () => {
      this.timer = null
      await this.refresh()
      if (this.running && this.generation === generation)
        this.timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => {
      if (this.generation === generation) this.stop()
    }
  }
  stop() {
    this.running = false
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
  async refresh() {
    if (!this.running) return
    const generation = this.generation,
      request = ++this.request
    const current = () =>
      this.running && this.generation === generation && this.request === request
    runInAction(() => {
      this.loading = true
    })
    try {
      const processes = await main.getProcessData()
      if (!current()) return
      runInAction(() => {
        this.processes = processes
        this.process =
          processes.find((process) => process.pid === this.process?.pid) || null
        this.error = false
      })
    } catch {
      if (current())
        runInAction(() => {
          this.error = true
        })
    } finally {
      if (current())
        runInAction(() => {
          this.loading = false
        })
    }
  }
}
export default new Store()
