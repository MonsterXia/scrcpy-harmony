import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { IosSetupAction, IosSetupState } from 'common/iosProvisioning'
import { IosProvisioning, runnerBundle, waitForSetup, type SetupData } from './manager'
import { IosHelper } from './helper'
import { setupErrors } from './protocol'
let manager: IosProvisioning | undefined, helper: IosHelper | undefined
let loading: Promise<IosProvisioning> | undefined
let busy: (udid: string) => boolean = () => false
let stopped = false
export function setIosProvisioningBusy(check: (udid: string) => boolean) { busy = check }
async function getManager() {
  if (stopped) throw Error('cancelled')
  if (loading) return loading
  if (manager) return manager
  if (!loading) loading = (async () => {
    const userData = app.getPath('userData'), file = path.join(userData,'ios-provisioning.json')
    const root = app.isPackaged ? path.join(process.resourcesPath,'ios-provisioning') : path.join(app.getAppPath(),'resources','ios-provisioning')
    helper = new IosHelper(root,createHash('sha256').update(userData).digest('hex'), !app.isPackaged,path.join(userData,'ios-reservations'))
    const data: SetupData = { devices: {} }
    try {
      const raw = await fs.readFile(file,'utf8'); if (raw.length > 65536) throw Error('protocol')
      const value = JSON.parse(raw)
      const valid = (b: any) => b && /^[A-Z0-9]{10}$/.test(b.teamId) && b.bundleId === runnerBundle(b.teamId)
      if (valid(value.team)) data.team = value.team
      for (const [id,binding] of Object.entries(value.devices || {})) if (/^[a-fA-F0-9-]{8,64}$/.test(id) && valid(binding)) data.devices[id] = binding as SetupData['team'] & object
    } catch { /* A fresh profile has no managed devices. */ }
    let saveTail = Promise.resolve()
    manager = new IosProvisioning({
      run: (kind,payload,event,signal) => helper!.run(kind,payload,event,signal),
      save: value => {
        const serialized = JSON.stringify(value)
        saveTail = saveTail.catch(() => {}).then(async () => {
          await fs.mkdir(userData,{recursive:true})
          await fs.writeFile(file+'.tmp',serialized,{mode:0o600}); await fs.rename(file+'.tmp',file)
        }); return saveTail
      }, isBusy: udid => busy(udid), now: Date.now,
      artifactVersion: async () => {
        const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'))
        const hash=manifest.files.find((f: {file: string})=>f.file==='WDA.ipa')?.sha256
        if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw Error('helper-unavailable')
        return hash
      },
    },data,() => {})
    await manager.restore().catch(() => {})
    if (stopped) { manager.dispose(); throw Error('cancelled') }
    return manager
  })().finally(() => { loading = undefined })
  return loading
}
export async function iosSetup(udid: string, value: IosSetupAction, signal?: AbortSignal): Promise<IosSetupState> {
  signal?.throwIfAborted()
  if (!value || typeof value !== 'object' || !['status','prepare','cancel','logout','reauthorize','login','team','code','sms','devices','resend'].includes(value.action)) throw Error('protocol')
  if (value.action === 'login' && (typeof value.email !== 'string' || value.email.length > 254 || typeof value.password !== 'string' || !value.password || value.password.length > 4096)) throw Error('protocol')
  if (value.action === 'team' && (typeof value.teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(value.teamId))) throw Error('protocol')
  if (value.action === 'code' && (typeof value.code !== 'string' || !/^\d{6}$/.test(value.code))) throw Error('protocol')
  if (value.action === 'sms' && (!Number.isSafeInteger(value.numberId) || value.numberId < 0 || value.numberId > 0xffffffff)) throw Error('protocol')
  const m = await waitForSetup(getManager(), signal)
  // Initialization restores shared credentials. A closed caller must not begin
  // an operation after that shared restore eventually finishes.
  signal?.throwIfAborted()
  try {
    if (value.action === 'login') {
      await m.login(udid,value.email,value.password,signal)
      signal?.throwIfAborted()
      const teams=m.status(udid).teams || []
      if (teams.length===1) await m.selectTeam(udid,teams[0].id,signal)
    } else if (value.action === 'prepare') await m.prepare(udid,true,signal)
    else if (value.action === 'team') await m.selectTeam(udid,value.teamId,signal)
    else if (value.action === 'logout') await m.logout(udid,signal)
    else if (value.action === 'reauthorize') m.reauthorize(udid)
    else if (value.action === 'cancel') m.cancel(udid)
    else if (value.action !== 'status') {
      if (!m.canReply(udid)) throw Error('auth-required')
      helper!.reply(value); m.challengeSubmitted(udid)
    }
  } catch (error) {
    const code = signal?.aborted ? 'cancelled' : (error as Error).message
    return { ...m.status(udid), phase: code === 'cancelled' ? 'cancelled' : code === 'auth-required' ? 'login' : 'error', error: setupErrors.has(code) ? code : 'device-error' }
  }
  return m.status(udid)
}
export async function prepareManagedIos(udid: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const m = await waitForSetup(getManager(), signal); signal?.throwIfAborted()
  if (m.managed(udid) || m.preparing(udid)) await m.prepare(udid,false,signal)
}
export async function renewIos(online: string[]) { const m = await getManager(); await m.renew(online) }
export function cancelIosSetup(udid: string) { manager?.cancel(udid) }
export function disposeIosSetup() { stopped = true; manager?.dispose() }
