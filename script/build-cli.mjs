import { build } from 'esbuild'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: build-cli.mjs [--out <directory>]')
const directory = args.length ? path.resolve(args[1]) : path.join(root, 'dist', 'cli')
await fs.mkdir(directory, { recursive: true })
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
for (const [entry,output] of [['src/cli/index.ts','index.cjs'],['src/mcp/index.ts','mcp.cjs']]) {
  await build({ entryPoints: [path.join(root, entry)], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: path.join(directory, output), banner: { js: '#!/usr/bin/env node' } })
  await fs.chmod(path.join(directory, output), 0o755)
}
await fs.copyFile(path.join(root, 'LICENSE'), path.join(directory, 'LICENSE'))
await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'scrcpy-plus-cli', version: pkg.version, description: 'Local automation client for Scrcpy Plus', license: pkg.license, engines: pkg.engines, bin: { 'scrcpy-plus': 'index.cjs', 'scrcpy-plus-mcp': 'mcp.cjs' }, files: ['index.cjs', 'mcp.cjs', 'LICENSE', 'THIRD_PARTY_LICENSES.txt'] }, null, 2) + '\n')
const sdkNotices = await Promise.all(['server','core','zod'].map(async name => {
  const base = path.join(root,'node_modules',name==='zod'?'zod':'@modelcontextprotocol/'+name)
  const dependency = JSON.parse(await fs.readFile(path.join(base,'package.json'),'utf8'))
  return `${dependency.name} ${dependency.version}\n` + await fs.readFile(path.join(base,'LICENSE'),'utf8')
}))
await fs.writeFile(path.join(directory,'THIRD_PARTY_LICENSES.txt'),sdkNotices.join('\n'))
