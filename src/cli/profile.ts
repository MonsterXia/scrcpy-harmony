import { homedir } from 'node:os'
import * as path from 'node:path'
export function defaultProfile() {
  if (process.env.SCRCPY_PLUS_PROFILE) return process.env.SCRCPY_PLUS_PROFILE
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support', 'Scrcpy Plus')
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'Scrcpy Plus')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'Scrcpy Plus')
}
