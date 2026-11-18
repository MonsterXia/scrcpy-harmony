import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { reserveWda, cleanupReservation, type ReservationJournal } from './reservation'
import { WdaClient } from '../devices/ios-wda'
import { HelperProtocol } from './protocol'
import type { HelperEvent } from './manager'
export class IosHelper {
  private verified?: Promise<void>
  private auth?: ChildProcessWithoutNullStreams
  constructor(private root: string, private scope: string, private verifyNative = true, private journalDirectory?: string) {}
  private journal(udid: string): ReservationJournal {
    if(!this.journalDirectory || !/^[a-fA-F0-9-]{8,64}$/.test(udid))throw Error('protocol')
    const file=path.join(this.journalDirectory,createHash('sha256').update(udid).digest('hex')+'.json')
    return {
      load: async()=>{
        let raw: string
        try {raw=await fs.readFile(file,'utf8')}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw Error('status-unknown')}
        if(raw.length>2048)throw Error('status-unknown')
        const value=JSON.parse(raw)
        if(!/^[a-zA-Z0-9-]{8,100}$/.test(value.runnerId)|| (value.sessionId!==undefined&&!/^[a-zA-Z0-9-]{1,100}$/.test(value.sessionId)))throw Error('status-unknown')
        return value
      },
      save:async value=>{await fs.mkdir(this.journalDirectory!,{recursive:true,mode:0o700});await fs.writeFile(file+'.tmp',JSON.stringify(value),{mode:0o600});await fs.rename(file+'.tmp',file)},
      clear:async()=>{await fs.rm(file,{force:true})},
    }
  }
  private verify() {
    if (!this.verified) this.verified = (async () => {
      const manifest = JSON.parse(await fs.readFile(path.join(this.root,'manifest.json'),'utf8'))
      // Frozen Python includes thousands of transitive package metadata files.
      // Keep this bound in sync with the build-time resource validator.
      if (manifest.platform !== process.platform || manifest.arch !== process.arch || manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 20000) throw Error('helper-unavailable')
      const realRoot = await fs.realpath(this.root)
      for (const entry of manifest.files) {
        if (typeof entry.file !== 'string' || path.isAbsolute(entry.file) || entry.file.split(/[\\/]/).includes('..') || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('helper-unavailable')
        const name = path.join(this.root, entry.file), real = await fs.realpath(name)
        if (!real.startsWith(realRoot + path.sep) || ((this.verifyNative || entry.file === 'WDA.ipa') && createHash('sha256').update(await fs.readFile(name)).digest('hex') !== entry.sha256)) throw Error('helper-unavailable')
      }
      const required = [process.platform === 'win32' ? 'ios-sign.exe' : 'ios-sign', process.platform === 'win32' ? 'device/ios-device.exe' : 'device/ios-device', 'WDA.ipa']
      if (required.some(file => !manifest.files.some((e: {file: string}) => e.file === file))) throw Error('helper-unavailable')
    })().catch(() => { this.verified = undefined; throw Error('helper-unavailable') })
    return this.verified
  }
  reply(value: Record<string, unknown>) {
    if (!this.auth || this.auth.killed) throw Error('auth-required')
    this.auth.stdin.write(JSON.stringify(value) + '\n')
  }
  async run(kind: 'sign' | 'device', payload: Record<string, unknown>, event: (event: HelperEvent) => void, signal: AbortSignal): Promise<any> {
    await this.verify(); signal.throwIfAborted()
    const file = kind === 'sign' ? 'ios-sign' : 'device/ios-device'
    const executable = path.join(this.root, file + (process.platform === 'win32' ? '.exe' : ''))
    const env: NodeJS.ProcessEnv = {}
    for (const name of ['HOME','USER','LOGNAME','TMPDIR','TEMP','TMP','SYSTEMROOT','WINDIR','APPDATA','LOCALAPPDATA','PROGRAMDATA','PATH']) if (process.env[name]) env[name] = process.env[name]
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'scrcpy-plus-ios-'))
    await fs.chmod(temporary,0o700)
    env.TMPDIR = temporary; env.TMP = temporary; env.TEMP = temporary
    return new Promise((resolve,reject) => {
      const child = spawn(executable, [], { stdio: 'pipe', env, windowsHide: true })
      if (payload.op === 'login') this.auth = child
      let release: (() => Promise<void>) | undefined, guarding = false
      let guardWork: Promise<void> | undefined
      let result: unknown, failure: string | undefined, stderrBytes = 0, force: ReturnType<typeof setTimeout> | undefined
      const stop = (code: string) => { failure ||= code; child.kill(); force ||= setTimeout(() => child.kill('SIGKILL'),2000) }
      const abort = () => stop('cancelled')
      const timeout = setTimeout(() => stop('timeout'), payload.op === 'inspect' ? 30000 : 300000)
      signal.addEventListener('abort',abort,{once:true})
      const protocol = new HelperProtocol(value => {
        if (value.error) failure = value.error
        else if (value.result) result = value.result
        else if (value.event === 'install-ready') {
          if (kind !== 'sign' || payload.op !== 'install' || guarding) { stop('protocol'); return }
          guarding = true
          guardWork = (async () => {
            const udid=String(payload.udid)
            const status=await this.run('device',{op:'inspect',udid,bundleId:`io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.${payload.teamId}`},()=>{},signal)
            if (status.busy) throw Error('busy')
            if (status.availability === 'unknown' || (!status.ready && status.availability !== 'absent')) throw Error('status-unknown')
            if (status.ready) release=await reserveWda(new WdaClient(udid),signal,this.journal(udid),`io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.${payload.teamId}`)
            signal.throwIfAborted()
            if (child.killed || child.exitCode !== null) throw Error('cancelled')
            child.stdin.end(JSON.stringify({action:'install'})+'\n')
          })().catch(error=>stop(error.message === 'busy' ? 'busy' : 'status-unknown'))
        } else event(value)
      })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data',chunk => { try { protocol.push(chunk) } catch { stop('protocol') } })
      child.stderr.on('data',chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) stop('protocol') })
      child.stdin.on('error',() => stop('protocol'))
      child.on('error',() => { failure = 'helper-unavailable' })
      child.on('close',async code => {
        await guardWork
        await release?.().catch(() => {})
        if (kind === 'device' && result && typeof result === 'object' && (result as any).ready) {
          try {
            const journal=this.journal(String(payload.udid))
            if (await journal.load()) {
              await cleanupReservation(new WdaClient(String(payload.udid)),journal)
              // Clearing an obsolete journal does not establish that the new
              // Runner is idle. Reinspect after cleanup, including its identity.
              result = await this.run('device', { op: 'inspect', udid: payload.udid, bundleId: payload.bundleId }, event, signal)
            }
          } catch { failure = 'status-unknown' }
        }
        await fs.rm(temporary,{recursive:true,force:true}).catch(() => {})
        clearTimeout(timeout); clearTimeout(force); signal.removeEventListener('abort',abort)
        if (this.auth === child) this.auth = undefined
        if (failure || code !== 0 || result === undefined) reject(Error(failure || 'protocol'))
        else resolve(result)
      })
      child.stdin.write(JSON.stringify({ ...payload, scope: this.scope, ...(payload.op === 'install' ? { ipa: path.join(this.root,'WDA.ipa') } : {}) }) + '\n')
      if (payload.op !== 'login' && payload.op !== 'install') child.stdin.end()
      if (signal.aborted) abort()
    })
  }
}
