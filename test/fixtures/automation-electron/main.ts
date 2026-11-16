// Explicitly simulated devices; real Electron window/IPC/Canvas and production
// automation controller/service/transport. Never opens USB or HDC connections.
import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { AutomationController } from '../../../src/main/automation/controller'
import { createAutomationService } from '../../../src/main/automation/service'
import { startAutomationServer } from '../../../src/main/automation/server'
import { registerSessionOperations } from '../../../src/main/automation/sessionOperations'
const root = process.env.AUTOMATION_PROBE_ROOT!
app.setPath('userData',path.join(root,'profile'))
app.on('window-all-closed',()=>{})
void app.whenReady().then(async()=>{
  let win: BrowserWindow | undefined, observer: ReturnType<AutomationController['attach']> | undefined
  const target = { key:'simulated:android',name:'SIMULATED Android — no device connected',platform:'android' as const,state:'ready' as const,ohosVersion:'',sdkVersion:'' }
  const discover=async()=>({targets:[target],errors:[]})
  const controller=new AutomationController({instanceId:'simulated-electron',ipc:ipcMain,discover,
    open:async(t,gui)=>{
      win=new BrowserWindow({show:false,width:300,height:200,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
      observer=controller.attach({target:t,window:win,gui,close:async()=>{win?.destroy()}})
      win.on('close',event=>{if(observer?.closeRequested())event.preventDefault()})
      win.on('closed',()=>observer?.closed())
      await win.loadFile(path.join(root,'index.html'))
    },input:()=>({touch:async phase=>{if(phase==='up')win?.webContents.send('simulatedInput')},text:async()=>win?.webContents.send('simulatedInput'),key:async()=>win?.webContents.send('simulatedInput'),scroll:async()=>win?.webContents.send('simulatedInput')})})
  const service=createAutomationService({instanceId:'simulated-electron',version:'SIMULATED',discover})
  registerSessionOperations(service,controller)
  const server=await startAutomationServer({profilePath:path.join(root,'profile'),instanceId:'simulated-electron',dispatch:service.dispatch})
  await writeFile(path.join(root,'ready.json'),JSON.stringify({ready:true,pid:process.pid}))
  let serial='',busy=false
  const poll=setInterval(async()=>{
    if(busy)return;busy=true
    try{
      const command=JSON.parse(await readFile(path.join(root,'command.json'),'utf8'))
      if(command.id===serial)return
      serial=command.id
      if(command.action==='gui-open')observer?.guiOpened()
      if(command.action==='gui-close')win?.close()
      const status={id:serial,visible:win&&!win.isDestroyed()?win.isVisible():false,destroyed:!win||win.isDestroyed(),windows:BrowserWindow.getAllWindows().length}
      await writeFile(path.join(root,'result.json'),JSON.stringify(status))
      if(command.action==='quit'){clearInterval(poll);await server.close();app.exit(0)}
    }catch{/* Parent has not submitted a complete command yet. */}finally{busy=false}
  },25)
})
