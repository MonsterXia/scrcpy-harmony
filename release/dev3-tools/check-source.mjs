// Exercise the real provider with a specified installed-version scalar; not an installed-app UI test.
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(path.resolve('package.json'))
const [version, expectations, report] = process.argv.slice(2)
if (!/^1\.0\.5-dev\.[23]$/.test(version)) throw Error('Unexpected current version')
require('./package.json').version = version
process.argv = [process.argv[0], 'script/check-release-source.mjs', expectations, report]
await import('../../script/check-release-source.mjs')
