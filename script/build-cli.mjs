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
await build({ entryPoints: [path.join(root, 'src/cli/index.ts')], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: path.join(directory, 'index.cjs'), banner: { js: '#!/usr/bin/env node' } })
await fs.chmod(path.join(directory, 'index.cjs'), 0o755)
await fs.copyFile(path.join(root, 'LICENSE'), path.join(directory, 'LICENSE'))
await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'scrcpy-plus-cli', version: pkg.version, description: 'Local automation client for Scrcpy Plus', license: pkg.license, engines: pkg.engines, bin: { 'scrcpy-plus': 'index.cjs' }, files: ['index.cjs', 'LICENSE'] }, null, 2) + '\n')
