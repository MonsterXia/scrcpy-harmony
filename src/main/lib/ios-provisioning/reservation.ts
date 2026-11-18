import { ownershipRunner } from '../devices/ios-ownership'
import type { WdaClient } from '../devices/ios-wda'
export interface Reservation { runnerId: string; sessionId?: string }
export interface ReservationJournal { load(): Promise<Reservation | undefined>; save(value: Reservation): Promise<void>; clear(): Promise<void> }
export async function cleanupReservation(client: WdaClient, journal: ReservationJournal) {
  const held=await journal.load(); if(!held) return
  const status=await client.request('GET','/status',undefined,undefined,5000)
  if(ownershipRunner(status)!==held.runnerId){await journal.clear();return}
  if(!held.sessionId)throw Error('status-unknown')
  if(status.sessionId===held.sessionId) await client.request('DELETE',`/session/${held.sessionId}`,undefined,undefined,5000)
  await journal.clear()
}
// Atomically reserve an already-running agent. Persist ownership before creation
// so cancellation, lost acknowledgements and process exits cannot erase the guard.
export async function reserveWda(client: WdaClient, signal: AbortSignal, journal?: ReservationJournal, bundleId?: string): Promise<() => Promise<void>> {
  let memory: Reservation | undefined
  journal ||= {load:async()=>memory,save:async value=>{memory=value},clear:async()=>{memory=undefined}}
  await cleanupReservation(client,journal);signal.throwIfAborted()
  const status=await client.request('GET','/status',undefined,signal)
  if(status.sessionId)throw Error('busy')
  if(bundleId && status.value?.scrcpyPlusBundleId!==bundleId)throw Error('runner-mismatch')
  const runnerId=ownershipRunner(status)
  await journal.save({runnerId})
  if(signal.aborted){await journal.clear();signal.throwIfAborted()}
  const result=await client.request('POST','/session',{scrcpyPlusRunnerId:runnerId,capabilities:{alwaysMatch:{}}})
  if(result.value?.scrcpyPlusSessionBusy || result.value?.scrcpyPlusRunnerChanged){await journal.clear();throw Error('busy')}
  const sessionId=result.value?.sessionId
  if(typeof sessionId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(sessionId))throw Error('status-unknown')
  await journal.save({runnerId,sessionId})
  const release=()=>cleanupReservation(client,journal!)
  if(signal.aborted){await release();signal.throwIfAborted()}
  return release
}
