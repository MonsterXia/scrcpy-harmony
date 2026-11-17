import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { assertInstalledClient } from './lib/automation-package-check.mjs'
const expectedVersion=JSON.parse(await fs.readFile('package.json','utf8')).version
const directory=await fs.mkdtemp(path.join(tmpdir(),'plus-package-测试 '))
const npm=process.env.npm_execpath
if(!npm)throw Error('Run through npm: npm run check:automation-package')
const run=(args,options={})=>execFileSync(process.execPath,[npm,...args],{encoding:'utf8',...options})
try {
  const packed=JSON.parse(run(['pack','--json','--pack-destination',directory],{cwd:path.resolve('dist/cli')}))
  const install=path.join(directory,'install')
  run(['install','--prefix',install,path.join(directory,packed[0].filename),'--ignore-scripts','--no-audit','--no-fund'])
  const base=path.join(install,'node_modules','scrcpy-plus-cli'),profile=path.join(directory,'profile')
  const schema=JSON.parse(execFileSync(process.execPath,[path.join(base,'index.cjs'),'schema','--json'],{encoding:'utf8',cwd:directory}));assert.equal(schema.ok,true)
  const missing=spawnSync(process.execPath,[path.join(base,'index.cjs'),'doctor','--profile',profile,'--json'],{encoding:'utf8',cwd:directory});assert.equal(missing.status,4);assert.equal(JSON.parse(missing.stdout).error.code,'UNAVAILABLE')
  const shim=path.join(install,'node_modules','.bin','scrcpy-plus')
  if(process.platform==='win32') {
    await fs.access(shim+'.cmd'); await fs.access(path.join(install,'node_modules','.bin','scrcpy-plus-mcp.cmd'))
  } else {
    const viaShim=JSON.parse(execFileSync(shim,['schema','--json'],{encoding:'utf8',cwd:directory}));assert.deepEqual(viaShim.data,schema.data)
    await fs.access(path.join(install,'node_modules','.bin','scrcpy-plus-mcp'),fs.constants.X_OK)
  }
  assert.match(await fs.readFile(path.join(base,'THIRD_PARTY_LICENSES.txt'),'utf8'),/zod/)
  const client=new Client({name:'installed-package-check',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}})
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(base,'mcp.cjs'),'--profile',profile],cwd:directory,stderr:'pipe'})
  let errors='';transport.stderr?.on('data',chunk=>errors+=chunk)
  try {
    await client.connect(transport)
    const list=await client.listTools()
    assertInstalledClient(JSON.parse(await fs.readFile(path.join(base,'package.json'),'utf8')),expectedVersion,list.tools,schema.data)
    const offline=await client.callTool({name:'schema',arguments:{}});assert.equal(offline.structuredContent.ok,true)
    const absent=await client.callTool({name:'doctor',arguments:{}});assert.equal(absent.isError,true);assert.equal(absent.structuredContent.error.code,'UNAVAILABLE')
    assert.equal(errors,'')
    process.stdout.write(JSON.stringify({status:'passed',tools:list.tools.length,cliOffline:true,mcpInstalled:true,serviceAbsent:true,dependenciesBundled:true})+'\n')
  } finally {await client.close()}
} finally {await fs.rm(directory,{recursive:true,force:true})}
