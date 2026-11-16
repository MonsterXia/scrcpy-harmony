// Real Electron + production React/PNG/WebCodecs renderer; simulated device IPC.
import { build } from 'esbuild'
import { compile } from 'sass'
import { _electron } from 'playwright-core'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
const root = process.cwd(), require = createRequire(import.meta.url)
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'plus-ios-ui-'))
const evidence = path.resolve(process.argv[2] || 'docs/scrcpy-plus/evidence/ios-usb-wda-2026-11-16')
await fs.mkdir(evidence, { recursive: true })
let application
try {
  await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import App from './src/renderer/native-mirror/App'; import {i18n} from './src/common/util';
    const listeners = new Map(); window.inputs=[]; window.acks=[]; window.states=[]; window.videos=[];
    window.emit=(name,data)=>listeners.get(name)?.(data);
    const state={id:'ios:test',state:'running',target:{name:'iPhone USB — SIMULATED',platform:'ios',transport:'usb'}};
    window.main={on:(name,fn)=>{listeners.set(name,fn);return()=>listeners.delete(name)},
      nativeMirrorInfo:async()=>state,nativeMirrorOpen:async()=>{},nativeMirrorFit:async()=>{},
      nativeMirrorInput:async input=>window.inputs.push(input),nativeMirrorAck:async n=>window.acks.push(n),
      automationFrameState:async s=>window.states.push(s),automationFrameResult:async()=>{},
      nativeMirrorVideo:async enabled=>{window.videos.push(enabled);window.emit('nativeMirrorState',{...state,videoMode:enabled?'video':'screenshot'})}};
    window.preload={setTitle:()=>{}};
    window.language=locale=>i18n.locale(locale);
    createRoot(document.getElementById('root')).render(<App/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(temporary, 'renderer.js'),
    tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'scss', setup(b) { b.onLoad({ filter: /\.scss$/ }, args => ({ contents: compile(args.path).css, loader: 'local-css' })) } }] })
  await fs.writeFile(path.join(temporary, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{height:100%;margin:0;font:14px system-ui;background:#181818;color:#eee}*{box-sizing:border-box}</style><div id="root"></div><script src="renderer.js"></script>')
  await fs.writeFile(path.join(temporary, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:460,height:840,webPreferences:{contextIsolation:true}});w.loadFile(${JSON.stringify(path.join(temporary,'index.html'))})});app.on('window-all-closed',()=>app.quit());`)
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({executablePath:require('electron'),args:[path.join(temporary,'main.cjs')],env})
  const page = await application.firstWindow(), errors = []
  page.on('console', m=>{if(m.type()==='error') console.error(m.text())})
  page.on('pageerror', e => errors.push(e.message))
  await page.waitForFunction(()=>document.querySelector('canvas')?.tabIndex===0)
  // Generate a real PNG in Chromium, then decode it through production createImageBitmap.
  const png = await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=390;c.height=844;const ctx=c.getContext('2d');
    ctx.fillStyle='#233b57';ctx.fillRect(0,0,390,844);ctx.fillStyle='#6edbb0';ctx.fillRect(90,300,210,120);
    ctx.fillStyle='#fff';ctx.font='24px sans-serif';ctx.fillText('USB PNG fixture',95,240);
    const data=new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer());
    window.png=data;window.emit('nativeMirrorFrame',{sessionId:'ios:test',sequence:1,timestamp:1,format:'png',rotation:0,data});return Array.from(data);
  })
  await page.waitForFunction(()=>window.acks.includes(1)&&window.states.some(s=>s.state==='presented'))
  assert.equal(await page.locator('canvas').evaluate(c=>c.width),390)
  assert.deepEqual(await page.locator('canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(100,310,1,1).data)),[110,219,176,255])
  await fs.writeFile(path.join(evidence,'fixture.png'),Buffer.from(png))
  const cases=[]
  for(const locale of ['en-US','zh-CN']) {
    const dictionary=JSON.parse(await fs.readFile(path.join(root,'src/common/langs',`${locale}.json`),'utf8'))
    await page.evaluate(locale=>window.language(locale),locale)
    await page.getByRole('button',{name:dictionary.plusIosStartVideo,exact:true}).waitFor()
    await page.locator('canvas').click({position:{x:220,y:300}})
    const inputs=await page.evaluate(()=>window.inputs.slice(-2))
    assert.deepEqual(inputs.map(i=>i.action),['down','up']);assert.deepEqual(inputs[0].display,{width:390,height:844,rotation:0})
    await page.getByRole('button',{name:dictionary.plusIosHome,exact:true}).click()
    assert.equal(await page.evaluate(()=>window.inputs.at(-1).keyCode),3)
    await page.screenshot({path:path.join(evidence,`${locale}-screenshot.png`)})
    await page.getByRole('button',{name:dictionary.plusIosStartVideo,exact:true}).click()
    await page.getByRole('button',{name:dictionary.plusIosStopVideo,exact:true}).waitFor()
    await page.getByRole('button',{name:dictionary.plusIosStopVideo,exact:true}).click()
    cases.push({locale,png:true,tapMetadata:true,home:true,videoToggle:true})
  }
  // Encode real Annex B H.264 and feed production H264Decoder/WebCodecs, then return to PNG.
  await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=390;c.height=844;const ctx=c.getContext('2d');ctx.fillStyle='#d84343';ctx.fillRect(0,0,c.width,c.height);
    const encoder=new VideoEncoder({output:chunk=>{const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);window.emit('nativeMirrorFrame',{sessionId:'ios:test',sequence:2,timestamp:100,rotation:0,keyFrame:true,data})},error:e=>{throw e}});
    encoder.configure({codec:'avc1.42001f',width:390,height:844,bitrate:1000000,framerate:30,latencyMode:'realtime',avc:{format:'annexb'}});
    for(let i=0;i<6;i++){const frame=new VideoFrame(c,{timestamp:100+i*33333});encoder.encode(frame,{keyFrame:i===0});frame.close()}await encoder.flush();encoder.close();
  })
  await page.waitForFunction(()=>{const p=document.querySelector('canvas').getContext('2d').getImageData(100,310,1,1).data;return p[0]>200&&p[1]<90})
  await page.evaluate(()=>window.emit('nativeMirrorFrame',{sessionId:'ios:test',sequence:3,timestamp:200,format:'png',rotation:180,data:window.png}))
  await page.waitForFunction(()=>window.acks.includes(3)&&window.states.at(-1).metadata?.rotation===180)
  assert.deepEqual(errors,[])
  const report={scope:'Real Electron production React renderer; simulated device IPC, no physical iPhone',cases,h264WebCodecs:true,pngFallback:true,rotationMetadata:true,errors}
  await fs.writeFile(path.join(evidence,'ui.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
} finally {await application?.close();await fs.rm(temporary,{recursive:true,force:true})}
