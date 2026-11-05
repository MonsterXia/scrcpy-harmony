// CI-only setup: verify the active Node release's headers/import library.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const temporary = process.env.RUNNER_TEMP, environment = process.env.GITHUB_ENV
if (!temporary || !environment) throw new Error('This setup requires a GitHub Actions runner')
const version = process.version, base = `https://nodejs.org/download/release/${version}/`
const directory = path.join(temporary, 'plus-node-build')
await fs.mkdir(directory, { recursive: true })
async function download(name) {
  const response = await fetch(base + name, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Node download failed: ${name} (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}
const checksums = (await download('SHASUMS256.txt')).toString()
async function verified(name, output) {
  const expected = checksums.split('\n').map(line => line.trim().split(/\s+/)).find(([, file]) => file === name)?.[0]
  const bytes = await download(name)
  if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Node artifact checksum mismatch: ' + name)
  await fs.writeFile(output, bytes)
}
const archive = path.join(directory, 'headers.tar.gz')
await verified(`node-${version}-headers.tar.gz`, archive)
execFileSync('tar', ['-xzf', archive, '-C', directory], { stdio: 'inherit' })
const headers = path.join(directory, `node-${version}`, 'include/node')
await fs.access(path.join(headers, 'node_api.h'))
await fs.appendFile(environment, `NODE_INCLUDE_DIR=${headers}\n`)
if (process.platform === 'win32') {
  const library = path.join(directory, 'node.lib')
  await verified(`win-${process.arch}/node.lib`, library)
  await fs.appendFile(environment, `NODE_LIBRARY=${library}\n`)
}
