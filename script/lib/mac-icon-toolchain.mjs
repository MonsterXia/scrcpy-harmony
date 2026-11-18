import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'plist'

// Resolve full Xcode for this process, without changing global xcode-select.
export function prepareMacIconToolchain() {
  if (process.platform !== 'darwin') return
  const selected = process.env.DEVELOPER_DIR
  const candidates = selected ? [selected] : [undefined, ...readdirSync('/Applications')
    .filter(name => /^Xcode.*\.app$/.test(name)).sort().reverse()
    .map(name => path.join('/Applications', name, 'Contents/Developer'))]
  for (const developerDir of candidates) {
    const env = developerDir ? { ...process.env, DEVELOPER_DIR: developerDir } : process.env
    try {
      const version = parse(execFileSync('xcrun', ['actool', '--version'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
        ['com.apple.actool.version']['short-bundle-version']
      const major = parseInt(version, 10)
      if (!Number.isFinite(major) || major < 26) continue
      // electron-builder calls actool directly rather than through xcrun.
      const tool = execFileSync('xcrun', ['--find', 'actool'], { env, encoding: 'utf8' }).trim()
      if (developerDir) process.env.DEVELOPER_DIR = developerDir
      process.env.PATH = path.dirname(tool) + path.delimiter + process.env.PATH
      console.log(`App icon compiler: Xcode ${version}`)
      return
    } catch {
      // Try installed full Xcode, unless the caller explicitly selected one.
    }
  }
  throw new Error('Scrcpy Plus macOS icons require Xcode 26 or later. Set DEVELOPER_DIR to its Contents/Developer directory.')
}
