#!/usr/bin/env node
// Runs real Electron with explicitly simulated devices. No real device input.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),exec=promisify(execFile)
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'plus-electron-automation-'))
const evidence=path.resolve(process.argv[2]||path.join(temporary,'evidence'))
await fs.mkdir(evidence,{recursive:true})
let child,log
async function until(read,timeout=20000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const v=await read();if(v)return v}catch(e){last=e}await new Promise(r=>setTimeout(r,50))}throw last||Error('Probe timed out')}
try{
 for(const entry of ['main','preload','renderer'])await build({entryPoints:[path.join(root,'test/fixtures/automation-electron',`${entry}.ts`)],outfile:path.join(temporary,`${entry}.${entry==='renderer'?'js':'cjs'}`),bundle:true,platform:entry==='renderer'?'browser':'node',format:entry==='renderer'?'iife':'cjs',external:['electron']})
 await fs.writeFile(path.join(temporary,'package.json'),JSON.stringify({name:'scrcpy-plus-simulated-automation-probe',version:'1.0.0',main:'main.cjs'}))
 await fs.writeFile(path.join(temporary,'index.html'),'<meta charset="UTF-8"><canvas width="240" height="100"></canvas><script src="renderer.js"></script>')
 const env={...process.env,AUTOMATION_PROBE_ROOT:temporary};delete env.ELECTRON_RUN_AS_NODE
 log=await fs.open(path.join(evidence,'electron.log'),'w')
 child=spawn(require('electron'),[temporary],{env,stdio:['ignore',log.fd,log.fd]})
 await until(async()=>JSON.parse(await fs.readFile(path.join(temporary,'ready.json'),'utf8')).ready)
 async function cli(args,client='default',expected=0){const result=await exec(process.execPath,[path.join(root,'dist/cli/index.cjs'),...args,'--profile',path.join(temporary,'profile'),'--client',client,'--json','--timeout-ms','10000'],{timeout:15000}).catch(e=>{if(e.code===expected)return e;throw e});const value=JSON.parse(result.stdout);assert.equal(value.ok,expected===0,JSON.stringify(value));return value.data}
 async function command(action){const id=String(Date.now());await fs.writeFile(path.join(temporary,'command.json'),JSON.stringify({id,action}));return until(async()=>{const v=JSON.parse(await fs.readFile(path.join(temporary,'result.json'),'utf8'));return v.id===id&&v})}
 const status=await cli(['service','status']);assert.equal(status.version,'SIMULATED')
 const a=await cli(['sessions','start','--device','simulated:android'])
 const b=await cli(['sessions','start','--device','simulated:android'],'other')
 assert.equal(a.sessionId,b.sessionId);assert.notEqual(a.leaseId,b.leaseId)
 await cli(['sessions','wait','--session',a.sessionId])
 const first=await cli(['screen','capture','--session',a.sessionId,'--output',path.join(evidence,'before.png')])
 const action=await cli(['input','tap','--session',a.sessionId,'--frame',first.frameId,'--x','30','--y','40'])
 const second=await cli(['screen','capture','--session',a.sessionId,'--after-action',action.observationToken,'--output',path.join(evidence,'after.png')])
 assert.ok(second.sequence>first.sequence);assert.notDeepEqual(await fs.readFile(first.path),await fs.readFile(second.path))
 assert.equal((await command('gui-open')).visible,true)
 const hidden=await command('gui-close');assert.equal(hidden.visible,false);assert.equal(hidden.destroyed,false)
 await cli(['screen','capture','--session',a.sessionId,'--output',path.join(evidence,'hidden.png')])
 await cli(['sessions','stop','--session',a.sessionId,'--lease',a.leaseId])
 assert.equal((await command('status')).destroyed,false)
 assert.equal((await cli(['sessions','leases'],'other')).length,1)
 await cli(['sessions','stop','--session',b.sessionId,'--lease',b.leaseId],'other')
 assert.equal((await command('status')).windows,0)
 await command('quit');await until(()=>child.exitCode===0)
 await assert.rejects(fs.access(path.join(temporary,'profile/automation/discovery.json')))
 const report={deviceMode:'SIMULATED ONLY',realElectron:true,host:process.platform,arch:process.arch,checks:{status:true,sharedBackend:true,independentLeases:true,realCanvasPng:true,inputObservationBarrier:true,guiCloseRetainsRenderer:true,hiddenCapture:true,lastOwnerCleanup:true,discoveryCleanup:true},frame:{width:first.width,height:first.height,beforeSequence:first.sequence,afterSequence:second.sequence}}
 await fs.writeFile(path.join(evidence,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{if(child&&child.exitCode===null)child.kill('SIGTERM');await log?.close();await fs.rm(temporary,{recursive:true,force:true})}
