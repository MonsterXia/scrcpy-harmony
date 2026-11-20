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
    import 'luna-toolbar/css'; import './src/renderer/icon.css';
    import App from './src/renderer/native-mirror/App'; import {i18n} from './src/common/util';
    const listeners = new Map(); window.inputs=[]; window.acks=[]; window.states=[]; window.videos=[]; window.opens=[]; window.failInput=false;
    window.emit=(name,data)=>listeners.get(name)?.(data);
    const state={id:'ios:test',state:'running',target:{name:'iPhone USB — SIMULATED',platform:'ios',transport:'usb'}};
    window.main={on:(name,fn)=>{listeners.set(name,fn);return()=>listeners.delete(name)},
      nativeMirrorInfo:async()=>state,nativeMirrorOpen:async restart=>{window.opens.push(restart);window.emit('nativeMirrorState',state)},nativeMirrorFit:async()=>{},
      nativeMirrorInput:async input=>{window.inputs.push(input);if(window.failInput){window.failInput=false;throw Error('simulated input failure')}},nativeMirrorAck:async n=>window.acks.push(n),
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
  await page.evaluate(()=>document.body.classList.add('platform-mac'))
  const designCases=[]
  for(const locale of ['en-US','zh-CN']) for(const theme of ['light','dark']) for(const width of [280,460]) {
    const dictionary=JSON.parse(await fs.readFile(path.join(root,'src/common/langs',`${locale}.json`),'utf8'))
    await page.evaluate(locale=>{window.language(locale);window.emit('nativeMirrorState',{id:'ios:test',state:'running',videoMode:'video-starting'})},locale)
    await page.waitForFunction(()=>document.querySelector('#ios-mirror-tools select')?.disabled===true)
    assert.equal(await page.locator('#ios-mirror-tools [role=status]').textContent(),dictionary.plusSessionStarting)
    await page.setViewportSize({width,height:740})
    await page.evaluate(({locale,theme})=>{
      window.language(locale);document.body.classList.toggle('-theme-with-dark-background',theme==='dark');
      document.body.style.setProperty('--color-bg-container',theme==='dark'?'#25282f':'#f4f6f9');
      document.body.style.setProperty('--color-text',theme==='dark'?'#f1f3f7':'#222733');
      window.emit('nativeMirrorState',{id:'ios:test',state:'error',connectionIssue:'ios-wda'});
    },{locale,theme})
    const setupDialog=page.getByRole('dialog')
    await setupDialog.waitFor()
    await page.keyboard.press('Escape')
    const card=page.getByRole('alert')
    await card.getByRole('heading',{name:dictionary.plusIosNotReady,exact:true}).waitFor()
    for (const [issue,key] of [['ios-wda-update','plusIosWdaUpdateRequired'],['ios-cleanup-unknown','plusIosCleanupUnknown']]) {
      await page.evaluate(issue=>window.emit('nativeMirrorState',{id:'ios:test',state:'error',connectionIssue:issue}),issue)
      await card.getByText(dictionary[key],{exact:true}).waitFor()
    }
    await page.evaluate(()=>window.emit('nativeMirrorState',{id:'ios:test',state:'error',connectionIssue:'ios-wda'}))
    await setupDialog.waitFor()
    await page.keyboard.press('Escape')
    await card.getByRole('heading',{name:dictionary.plusIosNotReady,exact:true}).waitFor()
    const before=await page.locator('canvas').boundingBox()
    const box=await card.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.width<=320)
    await card.screenshot({path:path.join(evidence,`${locale}-${theme}-${width}-setup.png`)})
    await card.locator('summary').click()
    await card.getByText(dictionary.plusIosSetupRunner,{exact:true}).waitFor()
    assert.deepEqual(await page.locator('canvas').boundingBox(),before)
    assert.ok(await card.getByRole('button',{name:dictionary.retry,exact:true}).isVisible())
    await card.screenshot({path:path.join(evidence,`${locale}-${theme}-${width}-setup-expanded.png`)})
    await page.getByRole('button',{name:dictionary.retry,exact:true}).click()
    await card.waitFor({state:'hidden'})
    const entry=await page.locator('[aria-controls="ios-mirror-tools"]').boundingBox()
    assert.ok(entry.x>width-50,'macOS tools belong at the right of the titlebar')
    await page.evaluate(()=>document.body.classList.remove('platform-mac'))
    const windowsEntry=await page.locator('[aria-controls="ios-mirror-tools"]').boundingBox()
    assert.ok(windowsEntry.x<50,'Windows tools must avoid the native controls on the right')
    await page.evaluate(()=>document.body.classList.add('platform-mac'))
    designCases.push({locale,theme,width,setupDisclosure:true,canvasGeometryUnchanged:true,rightAlignedTools:true})
  }
  await page.setViewportSize({width:460,height:840})
  await page.evaluate(()=>{document.body.classList.remove('-theme-with-dark-background');document.body.style.setProperty('--color-bg-container','#f4f6f9');document.body.style.setProperty('--color-text','#222733')})
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
    const bounds = await page.locator('canvas').boundingBox()
    assert.equal(bounds.x, 0); assert.equal(bounds.y, 0)
    assert.equal(await page.locator('header').count(), 0)
    await page.evaluate(()=>window.emit('nativeMirrorState',{id:'ios:test',state:'error',connectionIssue:'ios-wda'}))
    await page.getByRole('alert').getByText(dictionary.plusIosWdaLost,{exact:true}).waitFor()
    assert.deepEqual(await page.locator('canvas').boundingBox(),bounds)
    assert.equal(await page.locator('canvas').evaluate(c=>getComputedStyle(c).opacity),'0.3')
    await page.getByRole('alert').screenshot({path:path.join(evidence,`${locale}-connection-interrupted.png`)})
    await page.evaluate(()=>window.emit('nativeMirrorState',{id:'ios:test',state:'running'}))
    await page.getByRole('alert').waitFor({state:'hidden'})
    assert.deepEqual(await page.locator('canvas').boundingBox(),bounds)
    await page.evaluate(()=>window.emit('nativeMirrorFrame',{sessionId:'ios:test',sequence:10,timestamp:10,format:'png',rotation:0,data:window.png}))
    await page.waitForFunction(()=>window.states.at(-1).state==='presented')
    const toggle=page.getByRole('button',{name:dictionary.showScreencastTools,exact:true})
    await toggle.press('Enter')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),dictionary.plusIosHome)
    const mode=page.getByRole('combobox',{name:dictionary.plusIosMirrorMode,exact:true})
    await mode.waitFor()
    assert.deepEqual(await page.locator('canvas').boundingBox(), bounds)
    await page.locator('canvas').click({position:{x:220,y:300}})
    const inputs=await page.evaluate(()=>window.inputs.slice(-2))
    assert.deepEqual(inputs.map(i=>i.action),['down','up']);assert.deepEqual(inputs[0].display,{width:390,height:844,rotation:0})
    await page.getByRole('button',{name:dictionary.plusIosHome,exact:true}).click()
    assert.equal(await page.evaluate(()=>window.inputs.at(-1).keyCode),3)
    await page.screenshot({path:path.join(evidence,`${locale}-screenshot.png`)})
    await mode.selectOption('video')
    await page.locator('#ios-mirror-tools').getByText('ReplayKit',{exact:true}).waitFor()
    await page.evaluate(()=>window.emit('nativeMirrorState',{id:'ios:test',state:'running',videoMode:'video-error'}))
    await page.getByRole('alert').getByText(dictionary.plusIosVideoFailed,{exact:true}).waitFor()
    await mode.selectOption('screenshot')
    await page.locator('#ios-mirror-tools').getByText(dictionary.plusIosBroadcastHint,{exact:true}).waitFor()
    assert.deepEqual(await page.evaluate(()=>window.videos.slice(-2)),[true,false])
    await page.getByRole('button',{name:dictionary.hideScreencastTools,exact:true}).click()
    await mode.waitFor({state:'hidden'})
    await page.waitForFunction(()=>getComputedStyle(document.getElementById('ios-mirror-tools')).visibility==='hidden')
    await page.screenshot({path:path.join(evidence,`${locale}-collapsed.png`)})
    await page.evaluate(()=>{window.failInput=true})
    await page.locator('canvas').click({position:{x:220,y:300}})
    await page.getByRole('alert').getByText(dictionary.plusNativeInputError,{exact:true}).waitFor()
    assert.deepEqual(await page.locator('canvas').boundingBox(),bounds)
    assert.equal(await page.getByRole('alert').getByText(dictionary.plusNativeConnected,{exact:true}).count(),0)
    const notice=await page.getByRole('alert').boundingBox();assert.ok(notice.height<bounds.height/4);assert.ok(notice.y>bounds.height/2)
    await page.screenshot({path:path.join(evidence,`${locale}-input-error.png`)})
    await page.getByRole('button',{name:dictionary.plusReconnectControl,exact:true}).click()
    await page.getByRole('alert').waitFor({state:'hidden'})
    assert.equal(await page.evaluate(()=>window.opens.at(-1)),true)
    await page.evaluate(()=>window.emit('nativeMirrorFrame',{sessionId:'ios:test',sequence:20,timestamp:20,format:'png',rotation:0,data:window.png}))
    await page.waitForFunction(()=>window.states.at(-1).state==='presented')
    await page.locator('canvas').click({position:{x:220,y:300}})
    assert.deepEqual(await page.evaluate(()=>window.inputs.slice(-2).map(i=>i.action)),['down','up'])

    cases.push({locale,png:true,tapMetadata:true,home:true,videoToggle:true,edgeToEdge:true,floatingToolsDoNotResizeCanvas:true,connectionErrorDoesNotResizeCanvas:true,staleFrameDimmed:true,recoveryClearsError:true,inputErrorNonBlocking:true,explicitReconnectRestoresInput:true})
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
  const report={scope:'Real Electron production React renderer; simulated device IPC, no physical iPhone',cases,designCases,h264WebCodecs:true,pngFallback:true,rotationMetadata:true,errors}
  await fs.writeFile(path.join(evidence,'ui.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
} finally {await application?.close();await fs.rm(temporary,{recursive:true,force:true})}
