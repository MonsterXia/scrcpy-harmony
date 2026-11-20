import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { compile } from 'sass'
import { _electron } from 'playwright-core'

const temporary = await mkdtemp(path.join(tmpdir(), 'ios-auth-ui-'))
const require = createRequire(import.meta.url)
let application
try {
  const { outputFiles } = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import IosSetup from './src/renderer/native-mirror/IosSetup';
    import status from './src/renderer/components/MirrorStatus.module.scss';
    import {i18n} from './src/common/util';
    document.getElementById('root').className=status.theme;
    window.language=locale=>i18n.locale(locale);
    window.challenge={phase:'challenge',challenge:{numbers:[{id:1,lastTwoDigits:'00'}]}};
    window.state=window.challenge;
    window.main={iosSetup:async request=>{
      if(request.action==='code') window.state={phase:'verifying'};
      return window.state;
    }};
    createRoot(document.getElementById('root')).render(<IosSetup onReady={()=>{}} onClose={()=>{}}/>);
  ` }, bundle: true, write: false, outfile: path.join(temporary,'bundle.js'),
  plugins: [{name:'styles',setup(builder){builder.onLoad({filter:/\.scss$/}, args=>({contents:compile(args.path).css,loader:'local-css'}))}}] })
  for (const output of outputFiles) await writeFile(output.path,output.contents)
  await writeFile(path.join(temporary,'index.html'),'<html><meta charset="utf-8"><link rel="stylesheet" href="bundle.css"><style>body{font:14px system-ui}</style><body><main id="root"></main><script src="bundle.js"></script></body></html>')
  await writeFile(path.join(temporary,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const win=new BrowserWindow({show:false});win.loadFile(${JSON.stringify(path.join(temporary,'index.html'))})})`)
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  application=await _electron.launch({executablePath:require('electron'),args:[path.join(temporary,'main.cjs')],env})
  const page=await application.firstWindow(),dialog=page.getByRole('dialog')
  const input=dialog.locator('input[autocomplete="one-time-code"]')
  await input.waitFor()
  for (const locale of ['zh-CN','en-US']) {
    const words=JSON.parse(await readFile(`src/common/langs/${locale}.json`))
    for (const dark of [false,true]) {
      await page.evaluate(({locale,dark})=>{window.language(locale);document.body.classList.toggle('-theme-with-dark-background',dark)},{locale,dark})
      await page.setViewportSize({width:280,height:590})
      await dialog.getByText(words.iosSetupDeliveryOptions).click()
      assert.ok(await dialog.getByRole('button',{name:words.iosSetupResend}).isVisible())
      for (const button of await dialog.getByRole('button').all()) {
        const box=await button.boundingBox();assert.ok(box && box.x>=0 && box.x+box.width<=280 && box.y+box.height<=590)
      }
      await dialog.getByText(words.iosSetupDeliveryOptions).click()
    }
    const verify=dialog.getByRole('button',{name:words.iosSetupVerify})
    assert.ok(await verify.isDisabled());await input.fill('012 345');assert.equal(await input.inputValue(),'012345')
    await verify.click();await dialog.getByText(words.iosSetupVerifying).waitFor()
    await page.evaluate(()=>{window.state={...window.challenge,error:'invalid-code'}})
    await dialog.getByText(words.iosSetupInvalidCode).waitFor();assert.equal(await input.inputValue(),'')
    await page.evaluate(()=>{window.state={phase:'login',error:'invalid-credentials'}})
    await dialog.getByText(words.iosSetupInvalidCredentials).waitFor();assert.ok(await dialog.locator('input[type=password]').isVisible())
    await page.evaluate(()=>{window.state={phase:'starting',authenticated:true}})
    await dialog.getByText(words.iosSetupStarting,{exact:true}).waitFor()
    for (const [error, message] of [['developer-trust',words.iosSetupLaunchDenied],['launch-failed',words.iosSetupLaunchFailed],['start-timeout',words.iosSetupRunnerNotReady]]) {
      await page.evaluate(error=>{window.state={phase:'error',authenticated:true,error}},error)
      await dialog.getByText(message).waitFor()
      const prepare=dialog.getByRole('button',{name:words.iosSetupPrepare})
      assert.equal(await prepare.getAttribute('data-tone'),'primary')
      const primary=await prepare.boundingBox(), close=await prepare.locator('xpath=following-sibling::button[1]').boundingBox()
      assert.equal(primary.x,close.x);assert.equal(primary.width,close.width)
    }
    await page.evaluate(()=>{window.state=window.challenge});await input.waitFor()
  }
  console.log('Passed: narrow English and Chinese dialogs in light/dark themes, verification, retry, and credential errors (simulated IPC).')
} finally { await application?.close();await rm(temporary,{recursive:true,force:true}) }
