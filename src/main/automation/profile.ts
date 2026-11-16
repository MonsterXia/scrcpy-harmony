// This module must run before stores or the Electron single-instance lock.
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import pkg from '../../../package.json'
app.setName(pkg.productName)
if (process.env.SCRCPY_PLUS_PROFILE) {
  const profilePath = process.env.SCRCPY_PLUS_PROFILE
  if (!isAbsolute(profilePath)) throw new Error('SCRCPY_PLUS_PROFILE must be absolute')
  mkdirSync(profilePath, { recursive: true, mode: 0o700 })
  app.setPath('userData', profilePath)
}
