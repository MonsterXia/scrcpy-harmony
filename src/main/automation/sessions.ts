import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { ITarget } from '../../common/types'
import { AutomationFault, checkContext } from '../../common/automation/protocol'
import type { AutomationContext } from '../../common/automation/protocol'

export type SessionState = 'starting' | 'authorizing' | 'waiting' | 'running' | 'disconnected' | 'error' | 'stopping' | 'stopped'
export interface SessionInfo { sessionId: string; deviceKey: string; platform: string; name: string; state: SessionState; revision: number }
export interface SessionControls { close(): Promise<void>; hide(): void; show(): void }
interface Lease { leaseId: string; clientId: string; active: boolean }
interface Entry { info: SessionInfo; controls: SessionControls; gui: boolean; leases: Map<string, Lease>; released: Map<string, { lease: Lease; at: number }>; stoppedAt?: number; stopping?: Promise<void>; cleanup?: Promise<void> }
export class AutomationSessions {
  private entries = new Map<string, Entry>()
  private devices = new Map<string, string>()
  private opening = new Map<string, Promise<void>>()
  private claimants = new Map<string, number>()
  constructor(readonly instanceId: string, private now = Date.now, private cleanupTimeoutMs = 5000) {}
  private prune() {
    for (const [id, entry] of this.entries) {
      if (entry.stoppedAt !== undefined && this.now() - entry.stoppedAt >= 300000) this.entries.delete(id)
      else for (const [leaseId, released] of entry.released) if (this.now() - released.at >= 300000) entry.released.delete(leaseId)
    }
  }
  private entry(id: string) {
    this.prune()
    const entry = this.entries.get(id)
    if (!entry) throw new AutomationFault('NOT_FOUND', 'Session is unknown or belongs to an earlier instance')
    return entry
  }
  get(id: string): SessionInfo { return { ...this.entry(id).info } }
  list(): SessionInfo[] { this.prune(); return [...this.entries.values()].map(entry => ({ ...entry.info })) }
  forDevice(key: string): string | undefined { return this.devices.get(key) }
  register(target: ITarget, controls: SessionControls, gui = true) {
    const existing = this.devices.get(target.key)
    if (existing) throw new AutomationFault('BUSY', 'A session already owns this device')
    const sessionId = `${this.instanceId}:${randomUUID()}`
    this.entries.set(sessionId, { info: { sessionId, deviceKey: target.key, platform: target.platform || 'harmony', name: target.name, state: 'starting', revision: 1 }, controls, gui, leases: new Map(), released: new Map() })
    this.devices.set(target.key, sessionId)
    return sessionId
  }
  setState(id: string, state: SessionState) {
    const entry = this.entries.get(id)
    if (!entry || entry.info.state === 'stopped' || (entry.info.state === 'stopping' && state !== 'error' && state !== 'stopped')) return
    if (entry.info.state !== state) { entry.info.state = state; entry.info.revision++ }
  }
  closed(id: string) {
    const entry = this.entries.get(id)
    if (!entry || entry.info.state === 'stopped') return
    entry.info.state = 'stopped'; entry.info.revision++; entry.stoppedAt = this.now(); entry.gui = false
    for (const lease of entry.leases.values()) this.retire(entry, lease)
    if (this.devices.get(entry.info.deviceKey) === id) this.devices.delete(entry.info.deviceKey)
  }
  claimGui(id: string) {
    const entry = this.entry(id)
    if (entry.info.state === 'stopped' || entry.stopping || entry.cleanup) throw new AutomationFault('UNAVAILABLE', 'Session is stopping or stopped')
    entry.gui = true; entry.controls.show()
  }
  releaseGui(id: string) {
    const entry = this.entry(id); entry.gui = false
    if ([...entry.leases.values()].some(lease => lease.active)) { entry.controls.hide(); return true }
    return false
  }
  hasLeases(id?: string) {
    const entries = id ? [this.entry(id)] : [...this.entries.values()]
    return entries.some(entry => [...entry.leases.values()].some(lease => lease.active))
  }
  leases(clientId: string) {
    this.prune()
    return [...this.entries.values()].flatMap(entry => [...entry.leases.values()]
      .filter(lease => lease.active && lease.clientId === clientId)
      .map(lease => ({ sessionId: entry.info.sessionId, deviceKey: entry.info.deviceKey, leaseId: lease.leaseId })))
  }
  requireLease(id: string, clientId: string) {
    const entry = this.entry(id)
    if (!entry.leases.get(clientId)?.active) throw new AutomationFault('UNAUTHORIZED', 'Client does not hold this session')
    if (entry.info.state === 'stopping' || entry.info.state === 'stopped' || entry.cleanup) throw new AutomationFault('UNAVAILABLE', 'Session is not active')
    return { ...entry.info }
  }
  async start(target: ITarget, context: AutomationContext, open: () => Promise<unknown>) {
    this.claimants.set(target.key, (this.claimants.get(target.key) || 0) + 1)
    try { return await this.acquire(target, context, open) }
    finally {
      const remaining = this.claimants.get(target.key)! - 1
      if (remaining) this.claimants.set(target.key, remaining)
      else {
        this.claimants.delete(target.key)
        const id = this.devices.get(target.key)
        const entry = id && this.entries.get(id)
        if (entry && !entry.gui && !this.hasLeases(id)) await this.closeEntry(entry).catch(() => {})
      }
    }
  }
  private async acquire(target: ITarget, context: AutomationContext, open: () => Promise<unknown>) {
    checkContext(context)
    const created = !this.devices.has(target.key) && !this.opening.has(target.key)
    if (!this.devices.has(target.key)) {
      let pending = this.opening.get(target.key)
      if (!pending) {
        pending = Promise.resolve().then(open).then(() => {})
        this.opening.set(target.key, pending)
        void pending.finally(() => { if (this.opening.get(target.key) === pending) this.opening.delete(target.key) }).catch(() => {})
      }
      await pending
    }
    const id = this.devices.get(target.key)
    if (!id) throw new AutomationFault('UNAVAILABLE', 'Backend did not register a session')
    const entry = this.entry(id)
    checkContext(context)
    if (entry.stopping || entry.cleanup) throw new AutomationFault('BUSY', 'Session cleanup is in progress')
    let lease = entry.leases.get(context.clientId)
    if (!lease?.active) { lease = { leaseId: randomUUID(), clientId: context.clientId, active: true }; entry.leases.set(context.clientId, lease) }
    return { ...entry.info, leaseId: lease.leaseId, created }
  }
  terminate(id: string) { return this.closeEntry(this.entry(id)) }
  private closeEntry(entry: Entry) {
    if (entry.stopping) return entry.stopping
    this.setState(entry.info.sessionId, 'stopping')
    // Retain an in-flight close after the caller's bounded wait expires. A
    // second release joins it; it must not overlap a second backend teardown.
    if (!entry.cleanup) {
      const cleanup = Promise.resolve().then(() => entry.controls.close()).then(() => this.closed(entry.info.sessionId))
      entry.cleanup = cleanup
      void cleanup.finally(() => { if (entry.cleanup === cleanup) entry.cleanup = undefined }).catch(() => {})
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    entry.stopping = Promise.race([entry.cleanup, new Promise<never>((_resolve,reject) => {
      timer = setTimeout(() => reject(new Error('Cleanup deadline exceeded')), this.cleanupTimeoutMs)
    })]).catch(() => {
      this.setState(entry.info.sessionId, 'error')
      throw new AutomationFault('OUTCOME_UNKNOWN', 'Session cleanup could not be confirmed', 'unknown')
    }).finally(() => { clearTimeout(timer); entry.stopping = undefined })
    return entry.stopping
  }
  private retire(entry: Entry, lease: Lease) {
    if (!lease.active) return
    lease.active = false
    entry.released.set(lease.leaseId, { lease, at: this.now() })
  }
  async release(id: string, leaseId: string, context: AutomationContext) {
    checkContext(context)
    const entry = this.entry(id), current = entry.leases.get(context.clientId)
    const lease = current?.leaseId === leaseId ? current : entry.released.get(leaseId)?.lease
    if (!lease || lease.clientId !== context.clientId) throw new AutomationFault('UNAUTHORIZED', 'Lease does not belong to this client')
    if (!lease.active) return this.get(id)
    const otherOwners = entry.gui || [...entry.leases.values()].some(other => other !== lease && other.active)
    if (otherOwners) this.retire(entry, lease)
    else { await this.closeEntry(entry); this.retire(entry, lease) }
    return this.get(id)
  }
  async releaseLease(leaseId: string, context: AutomationContext) {
    this.prune()
    for (const entry of this.entries.values()) if (entry.leases.get(context.clientId)?.leaseId === leaseId || entry.released.get(leaseId)?.lease.clientId === context.clientId) return this.release(entry.info.sessionId, leaseId, context)
    throw new AutomationFault('NOT_FOUND', 'Lease not found for this client')
  }
  async wait(id: string, state: SessionState, context: AutomationContext) {
    while (true) {
      checkContext(context)
      const info = this.get(id)
      if (info.state === state) return info
      if (['error','disconnected','stopped'].includes(info.state)) throw new AutomationFault('UNAVAILABLE', `Session entered ${info.state}`)
      try { await delay(Math.max(1, Math.min(25, context.deadline - Date.now())), undefined, { signal: context.signal }) }
      catch { checkContext(context); throw new AutomationFault('CANCELLED', 'Session wait cancelled') }
    }
  }
}
