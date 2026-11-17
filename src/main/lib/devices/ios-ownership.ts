import type { WdaClient } from './ios-wda'

export class WdaUpdateRequired extends Error {
  readonly code = 'IOS_WDA_UPDATE_REQUIRED'
  constructor() { super('Update the signed Scrcpy Plus WDA Runner before connecting') }
}
export class WdaAllocationUnknown extends Error {
  readonly code = 'IOS_WDA_ALLOCATION_UNKNOWN'
  constructor() { super('WDA allocation outcome unknown; restart the dedicated Runner to confirm cleanup') }
}
export function ownershipRunner(status: { value?: Record<string, unknown> }): string {
  const value = status.value
  if (value?.scrcpyPlusProtocolVersion !== 1 || typeof value.scrcpyPlusRunnerId !== 'string' ||
    !/^[a-zA-Z0-9-]{8,100}$/.test(value.scrcpyPlusRunnerId)) throw new WdaUpdateRequired()
  return value.scrcpyPlusRunnerId
}
// An allocation may have succeeded even when its response was lost. Without an
// ID we cannot delete it or claim cleanup succeeded. The pinned Runner binds
// creation to this process identity; only a different ready process proves the
// unknown allocation is gone. Never adopt or delete a guessed remote resource.
export class WdaAllocation {
  private unknownRunner?: string
  begin(runner: string) {
    if (typeof runner !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(runner)) throw new WdaUpdateRequired()
    this.unknownRunner = runner
  }
  settled() { this.unknownRunner = undefined }
  async confirmCleanup(client: WdaClient) {
    if (!this.unknownRunner) return
    try {
      const status = await client.request('GET', '/status', undefined, undefined, 5000)
      if (status.value?.ready === true && ownershipRunner(status) !== this.unknownRunner) {
        this.unknownRunner = undefined; return
      }
    } catch { /* An unreachable or old Runner cannot prove cleanup. */ }
    throw new WdaAllocationUnknown()
  }
}
