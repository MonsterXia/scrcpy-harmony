import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { assertInstalledClient } from '../../script/lib/automation-package-check.mjs'
const directory=await fs.mkdtemp(path.join(tmpdir(),'plus-package-测试 '))
const npm=process.env.npm_execpath || await fs.realpath(execFileSync('which',['npm'],{encoding:'utf8'}).trim())
if(!npm)throw Error('Run through npm: npm run check:automation-package')
const run=(args,options={})=>execFileSync(process.execPath,[npm,...args],{encoding:'utf8',...options})
try {
  const archive=await fs.realpath(process.argv[2]);
  const expectedVersion=process.argv[3];if(!expectedVersion)throw Error('Version required')
  const install=path.join(directory,'install')
  run(['install','--prefix',install,archive,'--ignore-scripts','--no-audit','--no-fund'])
  const base=path.join(install,'node_modules','scrcpy-plus-cli'),profile=path.join(directory,'profile')
  const installed=JSON.parse(await fs.readFile(path.join(base,'package.json'),'utf8'));assert.equal(installed.version,expectedVersion);assert.equal(installed.name,'scrcpy-plus-cli');assert.equal((await fs.readFile(path.join(base,'LICENSE'),'utf8')).length>20,true)
  const schema=JSON.parse(execFileSync(process.execPath,[path.join(base,'index.cjs'),'schema','--json'],{encoding:'utf8',cwd:directory}));assert.equal(schema.ok,true)
  const missing=spawnSync(process.execPath,[path.join(base,'index.cjs'),'doctor','--profile',profile,'--json'],{encoding:'utf8',cwd:directory});assert.equal(missing.status,4);assert.equal(JSON.parse(missing.stdout).error.code,'UNAVAILABLE')
  assert.match(await fs.readFile(path.join(base,'THIRD_PARTY_LICENSES.txt'),'utf8'),/zod/)
  const client=new Client({name:'installed-package-check',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}})
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(base,'mcp.cjs'),'--profile',profile],cwd:directory,stderr:'pipe'})
  let errors='';transport.stderr?.on('data',chunk=>errors+=chunk)
  try {
    await client.connect(transport)
    const list=await client.listTools();assertInstalledClient(installed,expectedVersion,list.tools,schema.data)
    const offline=await client.callTool({name:'schema',arguments:{}});assert.equal(offline.structuredContent.ok,true)
    const absent=await client.callTool({name:'doctor',arguments:{}});assert.equal(absent.isError,true);assert.equal(absent.structuredContent.error.code,'UNAVAILABLE')
    assert.equal(errors,'')
    process.stdout.write(JSON.stringify({status:'passed',tools:list.tools.length,cliOffline:true,mcpInstalled:true,serviceAbsent:true,dependenciesBundled:true})+'\n')
  } finally {await client.close()}
} finally {await fs.rm(directory,{recursive:true,force:true})}
