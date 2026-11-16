import * as fs from 'node:fs/promises'
import { constants } from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { AutomationFault, isRecord } from '../../common/automation/protocol'

export interface Discovery { apiVersion: 1; endpoint: string; instanceId: string; token: string; pid: number }
export function discoveryDirectory(profilePath: string) { return path.join(profilePath, 'automation') }
export async function secureDirectory(directory: string) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new AutomationFault('UNAUTHORIZED', 'Unsafe automation directory')
  if (process.platform === 'win32') {
    // A new ACL, rather than inherited defaults, avoids granting other local users
    // access to the bearer token on profiles located outside AppData.
    const script = `$id=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($id); $acl.SetAccessRuleProtection($true,$false); $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); Set-Acl -LiteralPath $env:SCRCPY_AUTOMATION_ACL_PATH -AclObject $acl -ErrorAction Stop`
    try { await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, SCRCPY_AUTOMATION_ACL_PATH: directory }, timeout: 10000, windowsHide: true }) }
    catch { throw new AutomationFault('UNAUTHORIZED', 'Could not restrict automation directory permissions') }
  } else await fs.chmod(directory, 0o700)
}
export async function readPrivateJson(file: string): Promise<unknown> {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 16384 || (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))) throw new AutomationFault('UNAUTHORIZED', 'Unsafe automation metadata')
    return JSON.parse(await handle.readFile('utf8'))
  } finally { await handle.close() }
}
export async function readDiscovery(profilePath: string): Promise<Discovery> {
  try {
    const directory = discoveryDirectory(profilePath)
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))) throw new AutomationFault('UNAUTHORIZED', 'Unsafe automation directory')
    const value = await readPrivateJson(path.join(directory, 'discovery.json'))
    if (!isRecord(value) || value.apiVersion !== 1) throw new AutomationFault('VERSION_MISMATCH', 'Unsupported discovery version')
    if (typeof value.endpoint !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value.endpoint) || Number(new URL(value.endpoint).port) > 65535 || typeof value.instanceId !== 'string' || !/^[\w-]{1,128}$/.test(value.instanceId) || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token) || !Number.isSafeInteger(value.pid) || (value.pid as number) < 1) throw new AutomationFault('UNAVAILABLE', 'Invalid service discovery metadata')
    if (!processAlive(value.pid as number)) throw new AutomationFault('UNAVAILABLE', 'Service discovery belongs to a stopped process')
    return value as unknown as Discovery
  } catch (error) {
    if (error instanceof AutomationFault) throw error
    throw new AutomationFault('UNAVAILABLE', 'Service unavailable; run service start or inspect the profile')
  }
}
function processAlive(pid: number) {
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}
export async function acquireOwnership(directory: string, instanceId: string, recoverStale: boolean) {
  const lockPath = path.join(directory, 'server.lock')
  // Stale recovery is allowed only after Electron has acquired its native
  // single-instance lock for this profile. Standalone users fail closed.
  if (recoverStale) {
    try {
      const previous = await readPrivateJson(lockPath)
      if (isRecord(previous) && Number.isSafeInteger(previous.pid) && (previous.pid as number) > 0 && !processAlive(previous.pid as number)) await fs.unlink(lockPath)
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  let handle
  try { handle = await fs.open(lockPath, 'wx', 0o600) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new AutomationFault('BUSY', 'Automation profile is owned; close the existing instance or inspect stale ownership')
    throw error
  }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, instanceId })); await handle.sync() }
  catch (error) { await fs.unlink(lockPath).catch(() => {}); throw error }
  finally { await handle.close() }
  return async () => {
    const value = await readPrivateJson(lockPath).catch(() => undefined)
    if (isRecord(value) && value.instanceId === instanceId && value.pid === process.pid) await fs.unlink(lockPath)
  }
}
export async function publishDiscovery(directory: string, value: Discovery) {
  const temporary = path.join(directory, `discovery-${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    await fs.rename(temporary, path.join(directory, 'discovery.json'))
  } finally { await fs.unlink(temporary).catch(() => {}) }
}
export async function removeDiscovery(directory: string, instanceId: string) {
  const file = path.join(directory, 'discovery.json')
  const value = await readPrivateJson(file).catch(() => undefined)
  if (isRecord(value) && value.instanceId === instanceId) await fs.unlink(file)
}
