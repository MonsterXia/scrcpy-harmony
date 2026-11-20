import type { IosSetupState, IosSigningTeam } from 'common/iosProvisioning'
import { setupErrors } from './protocol'
export interface Binding { teamId: string; bundleId: string; revision?: string }
export interface SetupData { team?: Binding; devices: Record<string, Binding> }
interface Inspection { installed: boolean; expiresAt?: number; ready: boolean; busy: boolean; developerMode: boolean; availability?: 'available' | 'absent' | 'unknown' }
export interface HelperEvent { event: string; phase?: string; challenge?: IosSetupState['challenge'] }
export interface Adapter {
  run(kind: 'sign' | 'device', request: Record<string, unknown>, event: (event: HelperEvent) => void, signal: AbortSignal): Promise<any>
  save(data: SetupData): Promise<void>
  isBusy(udid: string): boolean
  artifactVersion?(): Promise<string>
  now(): number
}
const DAY = 86400000
export const runnerBundle = (teamId: string) => `io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.${teamId}`
// A caller joining shared work may stop waiting without cancelling its owner.
export function waitForSetup<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    work.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
    if (signal.aborted) abort()
  })
}
export class IosProvisioning {
  private states = new Map<string, IosSetupState>()
  private jobs = new Map<string, { kind: 'prepare' | 'recover'; controller: AbortController; work: Promise<void> }>()
  private nextCheck = new Map<string, number>()
  private account: { authenticated: boolean; teams: IosSigningTeam[] } = { authenticated: false, teams: [] }
  private authJob?: { udid: string; controller: AbortController }
  private logoutJob?: { udid: string; controller: AbortController }
  private selection?: { udid: string; controller: AbortController }
  private accountEpoch = 0
  private disposed = false
  constructor(private adapter: Adapter, private data: SetupData, private change: (udid: string, state: IosSetupState) => void) {}
  status(udid: string): IosSetupState { return { ...this.account, ...this.states.get(udid) || { phase: 'idle' } } }
  private set(udid: string, state: IosSetupState) { this.states.set(udid, state); this.change(udid, this.status(udid)) }
  private event(udid: string, signal: AbortSignal) {
    return (event: HelperEvent) => {
      if (signal.aborted) return
      if (event.event === 'challenge') {
        const error = event.challenge?.retry ? (this.status(udid).phase === 'verifying' ? 'invalid-code' : 'delivery-failed') : undefined
        this.set(udid, { phase: 'challenge', challenge: event.challenge, error })
      }
      else if (['installing','mounting','starting'].includes(event.phase || '')) this.set(udid, { phase: event.phase as IosSetupState['phase'] })
    }
  }
  canReply(udid: string) { return this.authJob?.udid === udid && this.status(udid).phase === 'challenge' }
  challengeSubmitted(udid: string, action: 'code' | 'sms' | 'resend' | 'devices') { if (this.canReply(udid)) this.set(udid,{phase:action === 'code' ? 'verifying' : 'sending'}) }
  async restore() {
    const epoch = this.accountEpoch
    const result = await this.adapter.run('sign', { op: 'account' }, () => {}, new AbortController().signal)
    if (epoch === this.accountEpoch && !this.disposed) this.account = { authenticated: result.authenticated === true, teams: result.teams || [] }
  }
  async login(udid: string, email: string, password: string, caller?: AbortSignal) {
    caller?.throwIfAborted()
    if (this.authJob || this.logoutJob || this.jobs.size || this.selection || this.disposed) throw Error('busy')
    this.accountEpoch++
    const controller = new AbortController(); this.authJob = { udid, controller }
    const signal = caller ? AbortSignal.any([controller.signal, caller]) : controller.signal
    this.set(udid, { phase: 'authenticating' })
    try {
      const result = await this.adapter.run('sign', { op: 'login', email, password }, this.event(udid, signal), signal)
      signal.throwIfAborted()
      this.account = { authenticated: result.authenticated === true, teams: result.teams || [] }
      this.set(udid, { phase: 'team' })
    } catch (e) {
      const code = (e as Error).message
      this.set(udid, signal.aborted ? { phase: 'cancelled' } : { phase: 'login', error: setupErrors.has(code) ? code : 'device-error' }); throw e
    }
    finally { this.authJob = undefined }
  }
  async selectTeam(udid: string, teamId: string, caller?: AbortSignal) {
    caller?.throwIfAborted()
    if (this.jobs.size || this.authJob || this.logoutJob || this.selection || this.disposed || !this.account.authenticated || !this.account.teams.some(t => t.id === teamId) || !/^[A-Z0-9]{10}$/.test(teamId)) throw Error('team-unavailable')
    const controller = new AbortController(); this.selection = {udid,controller}
    const signal = caller ? AbortSignal.any([controller.signal, caller]) : controller.signal
    try {
      this.data.team = { teamId, bundleId: runnerBundle(teamId) }; await this.adapter.save(this.data)
      signal.throwIfAborted()
    } catch (e) { if (signal.aborted) this.set(udid, { phase: 'cancelled' }); throw e }
    finally { this.selection = undefined }
    return this.prepare(udid, true, signal)
  }
  prepare(udid: string, interactive = true, caller?: AbortSignal): Promise<void> {
    if (caller?.aborted) return Promise.reject(caller.reason)
    const pending = this.jobs.get(udid)
    if (pending) {
      const done = waitForSetup(pending.work, caller)
      return pending.kind === 'recover' ? done.then(() => this.prepare(udid, interactive, caller)) : done
    }
    if (this.disposed || !/^[a-fA-F0-9-]{8,64}$/.test(udid)) return Promise.reject(Error('device-unavailable'))
    if (this.authJob || this.logoutJob || this.jobs.size || this.selection) return Promise.reject(Error('busy'))
    const binding = interactive ? this.data.team || this.data.devices[udid] : this.data.devices[udid]
    if (!binding) { this.set(udid, { phase: this.account.authenticated ? 'team' : 'login' }); return Promise.reject(Error('auth-required')) }
    if (this.adapter.isBusy(udid)) { this.set(udid, { phase: 'deferred' }); return Promise.resolve() }
    const controller = new AbortController(), signal = caller ? AbortSignal.any([controller.signal, caller]) : controller.signal
    const run = async (kind: 'sign' | 'device', payload: Record<string, unknown>) => {
      signal.throwIfAborted()
      const result = await this.adapter.run(kind, payload, this.event(udid, signal), signal)
      signal.throwIfAborted(); return result
    }
    const work = (async () => {
      this.set(udid, { phase: 'checking' })
      const request = { udid, bundleId: binding.bundleId }
      let info: Inspection = await run('device', { op: 'inspect', ...request })
      if (info.busy || this.adapter.isBusy(udid)) { this.set(udid, { phase: 'deferred', expiresAt: info.expiresAt }); return }
      if (info.availability === 'unknown') throw Error('status-unknown')
      const revision = await this.adapter.artifactVersion?.(); signal.throwIfAborted()
      const due = !this.data.devices[udid] || this.data.devices[udid].revision !== revision || !info.installed || !info.expiresAt || info.expiresAt <= this.adapter.now() + DAY
      if (due) {
        this.set(udid, { phase: 'signing' })
        await run('sign', { op: 'install', udid, teamId: binding.teamId })
        info = await run('device', { op: 'inspect', ...request })
        if (!info.installed || !info.expiresAt || info.expiresAt <= this.adapter.now()) throw Error('profile-invalid')
      }
      this.data.devices[udid] = { ...binding, revision }
      await this.adapter.save(this.data); signal.throwIfAborted()
      if (!info.ready) {
        if (!info.developerMode) throw Error('developer-mode')
        this.set(udid, { phase: 'starting', expiresAt: info.expiresAt })
        const started = await run('device', { op: 'start', ...request })
        if (!started.ready) throw Error('start-timeout')
      }
      this.set(udid, { phase: 'ready', expiresAt: info.expiresAt })
    })().catch(error => {
      const code = setupErrors.has(error.message) ? error.message : 'device-error'
      this.set(udid, signal.aborted ? { phase: 'cancelled' } : { phase: code === 'auth-required' ? 'login' : 'error', error: code })
      throw error
    }).finally(() => { this.jobs.delete(udid); this.nextCheck.set(udid, this.adapter.now() + 15 * 60000) })
    this.jobs.set(udid, { kind: 'prepare', controller, work }); return work
  }
  async recoverRunner(udid: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const binding = this.data.devices[udid]
    if (!binding) throw Error('not-installed')
    if (this.disposed || this.jobs.size || this.authJob || this.logoutJob || this.selection) throw Error('busy')
    const controller = new AbortController()
    const recoverySignal = AbortSignal.any([signal, controller.signal])
    const work = this.adapter.run('device', { op: 'recover', udid, bundleId: binding.bundleId },
      () => {}, recoverySignal).then(result => {
      recoverySignal.throwIfAborted()
      if (result.busy) throw Error('busy')
      if (!result.ready || result.runnerBundleId !== binding.bundleId) throw Error('runner-mismatch')
    }).finally(() => { this.jobs.delete(udid) })
    this.jobs.set(udid, { kind: 'recover', controller, work })
    return work
  }
  async renew(online: string[]) {
    for (const udid of Object.keys(this.data.devices)) {
      if (this.disposed || this.authJob || this.logoutJob || this.jobs.size) return
      if (!online.includes(udid) || this.adapter.isBusy(udid) || (this.nextCheck.get(udid) || 0) > this.adapter.now()) continue
      await this.prepare(udid, false).catch(() => {})
    }
  }
  preparing(udid: string) { return this.jobs.has(udid) || this.selection?.udid === udid }
  managed(udid: string) { return !!this.data.devices[udid] }
  cancel(udid: string) {
    this.jobs.get(udid)?.controller.abort()
    if (this.selection?.udid === udid) this.selection.controller.abort()
    if (this.authJob?.udid === udid) this.authJob.controller.abort()
    if (this.logoutJob?.udid === udid) this.logoutJob.controller.abort()
    this.set(udid, { phase: 'cancelled' })
  }
  reauthorize(udid: string) {
    if (this.jobs.size || this.authJob || this.logoutJob || this.selection || this.disposed) throw Error('busy')
    this.set(udid,{phase:'login'})
  }
  async logout(udid: string, caller?: AbortSignal) {
    caller?.throwIfAborted()
    if (this.jobs.size || this.authJob || this.logoutJob || this.selection || this.disposed) throw Error('busy')
    this.accountEpoch++
    const controller = new AbortController(); this.logoutJob = { udid, controller }
    const signal = caller ? AbortSignal.any([controller.signal, caller]) : controller.signal
    try {
      await this.adapter.run('sign', { op: 'logout' }, () => {}, signal)
      signal.throwIfAborted()
      this.account = { authenticated: false, teams: [] }; delete this.data.team
      await this.adapter.save(this.data); signal.throwIfAborted()
      this.set(udid, { phase: 'login' })
    } catch (e) { if (signal.aborted) this.set(udid, { phase: 'cancelled' }); throw e }
    finally { this.logoutJob = undefined }
  }
  dispose() { this.disposed = true; for (const udid of this.jobs.keys()) this.cancel(udid); if (this.authJob) this.cancel(this.authJob.udid); if (this.logoutJob) this.cancel(this.logoutJob.udid); if (this.selection) this.cancel(this.selection.udid) }
}
