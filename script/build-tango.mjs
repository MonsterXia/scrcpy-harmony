import fs from 'node:fs/promises'
import path from 'node:path'
import { transform } from 'esbuild'
const root = path.resolve('vendor/tango')
async function walk(directory) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(file))
    else files.push(file)
  }
  return files
}
for (const entry of await fs.readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const source = path.join(root, entry.name, 'src')
  for (const file of await walk(source)) {
    if (!file.endsWith('.ts') || /\.(test|spec|d)\.ts$/.test(file)) continue
    const output = path.join(root, entry.name, 'esm', path.relative(source, file).replace(/\.ts$/, '.js'))
    const result = await transform(await fs.readFile(file, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' })
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, result.code)
  }
}
console.log('Rebuilt vendored Tango protocol modules from TypeScript source')
