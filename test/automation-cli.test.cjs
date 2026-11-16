const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { buildSync } = require('esbuild')
const load = require('./helpers/load-automation.cjs')
let buildRoot, cli
before(async () => {
  buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-cli-build-'))
  cli = path.join(buildRoot, 'cli.cjs')
  buildSync({ entryPoints: ['src/cli/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: cli })
})
after(async () => { if (buildRoot) await fs.rm(buildRoot, { recursive: true, force: true }) })
function run(args, onSpawn) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
    child.on('error', reject); child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
    onSpawn?.(child)
  })
}
async function service(t, dispatch) {
  const { startAutomationServer } = load('src/main/automation/server.ts')
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-cli-测试 ')); t.after(() => fs.rm(profilePath, { recursive: true, force: true }))
  const server = await startAutomationServer({ profilePath, instanceId: 'cli-fixture', dispatch }); t.after(() => server.close())
  return { profilePath, ...server }
}
test('CLI help and schema work offline; invalid and duplicate arguments fail with structured exit 2', async () => {
  assert.match((await run(['--help'])).stdout, /devices list/)
  const schema = await run(['schema', '--json']); assert.equal(schema.code, 0)
  assert.equal(JSON.parse(schema.stdout).data.apiVersion, 1)
  for (const args of [['devices','list','--wat','--json'], ['devices','capabilities','--json'], ['devices','list','--timeout-ms','0','--json'], ['devices','list','--json','--json']]) {
    const result = await run(args); assert.equal(result.code, 2); assert.equal(JSON.parse(result.stdout).ok, false)
  }
})
test('missing service is a structured unavailable result without launching an app', async t => {
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-cli-empty-')); t.after(() => fs.rm(profilePath, { recursive: true, force: true }))
  const result = await run(['devices','list','--profile',profilePath,'--json'])
  assert.equal(result.code, 4); assert.equal(JSON.parse(result.stdout).error.code, 'UNAVAILABLE')
  assert.equal(result.stderr, '')
})
test('CLI calls the real local transport and preserves named client identity across commands', async t => {
  const identities = []
  const f = await service(t, async r => { identities.push(r.clientId); return { apiVersion: 1, requestId: r.requestId, ok: true, data: { devices: [] } } })
  for (const client of ['agent-a', 'agent-a', 'agent-b']) {
    const result = await run(['devices','list','--profile',f.profilePath,'--client',client,'--json'])
    assert.equal(result.code, 0); assert.deepEqual(JSON.parse(result.stdout).data, { devices: [] }); assert.equal(result.stderr, '')
  }
  assert.equal(identities[0], identities[1]); assert.notEqual(identities[0], identities[2])
})
test('CLI validates service result version and request identity', async t => {
  const f = await service(t, async r => ({ apiVersion: 2, requestId: r.requestId, ok: true, data: {} }))
  const result = await run(['service','status','--profile',f.profilePath,'--json'])
  assert.equal(result.code, 2); assert.equal(JSON.parse(result.stdout).error.code, 'VERSION_MISMATCH')
})
test('CLI deadline aborts pending work and never retries the operation', async t => {
  let calls = 0
  const f = await service(t, async () => { calls++; return new Promise(() => {}) })
  const result = await run(['devices','list','--profile',f.profilePath,'--timeout-ms','150','--json'])
  assert.equal(result.code, 6); assert.equal(calls, 1)
})
test('Ctrl+C exits 130 and closes an active HTTP request', async t => {
  let child, began
  const started = new Promise(resolve => { began = resolve })
  const f = await service(t, async () => { began(); return new Promise(() => {}) })
  const running = run(['devices','list','--profile',f.profilePath,'--json'], value => { child = value })
  await started; child.kill('SIGINT')
  const result = await running
  assert.equal(result.code, 130); assert.equal(JSON.parse(result.stdout).error.code, 'CANCELLED')
})
test('stale bearer credentials produce authorization exit 5, not an invalid-result error', async t => {
  const f = await service(t, async r => ({ apiVersion: 1, requestId: r.requestId, ok: true, data: {} }))
  const file = path.join(f.profilePath, 'automation', 'discovery.json')
  const discovery = JSON.parse(await fs.readFile(file, 'utf8')); discovery.token = '0'.repeat(64)
  await fs.writeFile(file, JSON.stringify(discovery))
  const result = await run(['service','status','--profile',f.profilePath,'--json'])
  assert.equal(result.code, 5); assert.equal(JSON.parse(result.stdout).error.code, 'UNAUTHORIZED')
})
test('unknown options cannot be hidden by help', async () => {
  const result = await run(['--help','--unrecognized','value','--json'])
  assert.equal(result.code, 2)
})
test('service start passes argument boundaries including option arguments and reuses a live service', async t => {
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-start-测试 ')); t.after(() => fs.rm(profilePath, { recursive: true, force: true }))
  const serverBundle = path.join(profilePath, 'server.cjs')
  buildSync({ entryPoints: ['src/main/automation/server.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: serverBundle })
  const app = path.join(profilePath, 'fixture app.cjs')
  await fs.writeFile(app, `const { startAutomationServer } = require('./server.cjs');\nconst fs = require('node:fs');\n(async () => {\n const s = await startAutomationServer({ profilePath: process.env.SCRCPY_PLUS_PROFILE, instanceId: 'fixture-start', dispatch: async r => ({ apiVersion: 1, requestId: r.requestId, ok: true, data: { args: process.argv.slice(2), pid: process.pid } }) });\n process.on('SIGTERM', () => s.close().then(() => process.exit(0)));\n})().catch(() => process.exit(0));\n`)
  let startedPid
  t.after(async () => { if (startedPid) { try { process.kill(startedPid, 'SIGTERM') } catch {} } })
  const args = ['service','start','--app',process.execPath,'--app-arg',app,'--app-arg','--fixture-flag','--profile',profilePath,'--timeout-ms','10000','--json']
  const [result, concurrent] = await Promise.all([run(args), run(args)])
  assert.equal(result.code, 0, result.stdout)
  const data = JSON.parse(result.stdout).data; startedPid = data.pid
  assert.equal(concurrent.code, 0, concurrent.stdout)
  assert.equal(JSON.parse(concurrent.stdout).data.pid, startedPid)
  assert.deepEqual(data.args, ['--fixture-flag'])
  const existing = await run(['service','start','--app','/not/a/real/app','--profile',profilePath,'--json'])
  assert.equal(existing.code, 0); assert.equal(JSON.parse(existing.stdout).data.pid, startedPid)
})
test('shell command file keeps script contents out of argv and conflicting sources fail before dispatch',async t=>{
 let received,calls=0;const f=await service(t,async r=>{calls++;received=r.params.command;return {apiVersion:1,requestId:r.requestId,ok:true,data:{exitCode:0,output:'ok',truncated:false}}})
 const file=path.join(f.profilePath,'script 文件.txt'),script="printf '%s' 'quoted;中文'\nexit 0";await fs.writeFile(file,script)
 const result=await run(['shell','run','--device','h','--command-file',file,'--profile',f.profilePath,'--json']);assert.equal(result.code,0);assert.equal(received,script)
 const bad=await run(['shell','run','--device','h','--command','read','--command-file',file,'--profile',f.profilePath,'--json']);assert.equal(bad.code,2);assert.equal(calls,1)
})
test('CLI exports finite artifacts through real binary transport and requires an output path',async t=>{
 let calls=0;const f=await service(t,async r=>{calls++;const bytes=Buffer.from(r.operation==='layout.dump'?'<Hierarchy/>':'');return {apiVersion:1,requestId:r.requestId,ok:true,data:{artifact:{artifactId:'fixture',mimeType:'text/plain',byteLength:bytes.length},bytes}}})
 for(const words of [['logs','capture'],['layout','dump']]){
  const output=path.join(f.profilePath,words[0]+'.txt')
  const invalid=await run([...words,'--device','h','--profile',f.profilePath,'--json']);assert.equal(invalid.code,2)
  const result=await run([...words,'--device','h','--output',output,'--profile',f.profilePath,'--json']);assert.equal(result.code,0,result.stdout);assert.equal(JSON.parse(result.stdout).data.path,output)
  assert.equal(await fs.readFile(output,'utf8'),words[0]==='logs'?'':'<Hierarchy/>')
 }
 assert.equal(calls,2)
})
