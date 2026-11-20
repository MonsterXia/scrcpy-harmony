export const setupErrors = new Set(['invalid-credentials','runner-mismatch','status-unknown','protocol','auth-required','team-unavailable','no-team','device-unavailable','certificate-limit','keychain-unavailable','signing-failed','busy','not-installed','developer-mode','start-timeout','developer-trust','launch-failed','device-locked','trust-computer','timeout','device-error','profile-invalid','helper-unavailable','cancelled'])
export class HelperProtocol {
  private buffer = ''
  private terminal = false
  constructor(private message: (value: any) => void) {}
  push(chunk: string) {
    this.buffer += chunk
    if (Buffer.byteLength(this.buffer) > 65536) throw Error('protocol')
    let index: number
    while ((index = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0,index); this.buffer = this.buffer.slice(index+1)
      const value = JSON.parse(line)
      if (this.terminal || !value || typeof value !== 'object') throw Error('protocol')
      if ('error' in value) { if (!setupErrors.has(value.error)) throw Error('protocol'); this.terminal = true }
      else if ('result' in value) { if (!value.result || typeof value.result !== 'object') throw Error('protocol'); this.terminal = true }
      else if (value.event === 'install-ready') { /* Installation waits for a fresh device/session guard. */ }
      else if (value.event === 'phase') { if (!['installing','mounting','starting'].includes(value.phase)) throw Error('protocol') }
      else if (value.event === 'challenge') {
        const c = value.challenge
        if (!c || !Array.isArray(c.numbers) || c.numbers.length > 20) throw Error('protocol')
        value.challenge = { sms: c.sms === true, unknown: c.unknown === true, retry: c.retry === true || !!c.lastError, selectedNumberId: c.selectedNumberId,
          numbers: c.numbers.map((n: any) => {
            if (!Number.isSafeInteger(n.id) || n.id < 0 || typeof n.lastTwoDigits !== 'string' || !/^\d{2}$/.test(n.lastTwoDigits)) throw Error('protocol')
            return { id: n.id, lastTwoDigits: n.lastTwoDigits }
          }) }
      } else throw Error('protocol')
      this.message(value)
    }
  }
}
