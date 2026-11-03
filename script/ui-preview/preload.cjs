const { contextBridge, ipcRenderer } = require('electron')
const listeners = new Map()
const emit = (event, ...args) => (listeners.get(event) || []).forEach(fn => fn(...args))
const target = { key: 'DEMO-DEVICE-001', name: 'Harmony development device', ohosVersion: '6.0', sdkVersion: '20' }
const settings = { theme: process.env.UI_THEME || 'light', language: process.env.UI_LANGUAGE || 'en-US', hdcPath: '', killHdcWhenExit: false, betaUpdate: false }
const values = { panel: process.env.UI_PAGE || 'overview', target: process.env.UI_EMPTY ? null : target, application: {listView: true,sysBundle:false,itemSize:48}, layout:{weights:[35,35,30],attribute:false,border:true} }
let infos = [ ['Notes','com.example.notes','1.2.0',false], ['Browser','com.example.browser','5.0.1',false], ['Photos','com.example.photos','2.4.0',false], ['Development application with a long display name','com.example.long.application.name','1.0.0',false], ['Settings','com.example.settings','6.0.0',true] ].map(([label,bundleName,versionName,system]) => ({label,bundleName,versionName,system,icon:'',apiTargetVersion:20,vendor:'Example vendor',installTime:1793600000000,releaseType:'release',mainAbility:'EntryAbility'}))
if (process.env.UI_MANY) infos = Array.from({length:100}, (_,index)=>({...infos[index%infos.length],label:`Sample application ${String(index+1).padStart(3,'0')}`,bundleName:`com.example.sample${index+1}`,system:false}))
if (process.env.UI_ZERO) infos=[]
const image = require('node:fs').readFileSync(require('node:path').join(__dirname,'sample-screen.png')).toString('base64')
const guarded = async value => { if(process.env.UI_ERROR) throw new Error('Simulated read failure'); return value }
let next = 1
const main = {
  getLanguage: async () => settings.language, getTheme: async () => ipcRenderer.invoke('fixture-theme'),
  getTargets: async () => process.env.UI_EMPTY ? [] : [target], getMainStore: async key => values[key],
  setMainStore: async (key, value) => { values[key] = value; emit('changeMainStore', key,value) },
  getSettingsStore: async key => settings[key],
  setSettingsStore: async (key,value) => { settings[key]=value; emit('changeSettingsStore',key,value); if(key==='theme') { const resolved=await ipcRenderer.invoke('fixture-theme',value);document.body.classList.toggle('-theme-with-dark-background',resolved==='dark');emit('updateTheme') } },
  getMemStore: async key => key==='targets' ? (process.env.UI_EMPTY?[]:[target]) : null,
  setMemStore: async () => {},
  on: (event, callback) => { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(callback); return () => { listeners.set(event, listeners.get(event).filter(fn => fn !== callback)) } },
  getOverview: async () => guarded({ name: target.name, brand:'Example vendor',model:'Development model',serialNum:target.key,kernelVersion:'Linux 5.10 (sample)',processor:'Example processor',abi:'arm64',physicalResolution:'360x720',memTotal:12884901888 }),
  getBundles: async (_,system) => guarded(infos.filter(x=>system||!x.system).map(x=>x.bundleName)),
  getBundleInfos: async (_,names) => guarded(infos.filter(x=>names.includes(x.bundleName))),
  startBundle: async () => {},stopBundle:async()=>{},cleanBundleCache:async()=>{},cleanBundleData:async()=>{},uninstallBundle:async()=>{},
  getProcesses: async () => guarded([{name:'com.example.notes','%cpu':'0.4','time+':'0:12.14',res:'96M',pid:'1234',user:'u0_a10'},{name:'com.example.browser','%cpu':'1.2','time+':'0:28.21',res:'120M',pid:'1235',user:'u0_a11'}]),
  getTopBundle: async () => guarded({name:'com.example.browser',pid:1235}),
  getWebviews: async () => guarded([{id:'demo-webview',title:'Example documentation',url:'https://example.com/docs/overview',type:'page',webSocketDebuggerUrl:'ws://127.0.0.1:9222/devtools/page/demo',faviconUrl:''}]),
  listForwards: async()=>guarded([{local:'tcp:8080',remote:'tcp:8080'}]), listReverses:async()=>guarded([]),forward:async()=>{},reverse:async()=>{},removeForward:async()=>{},removeReverse:async()=>{},inputKey:async()=>{},
  screencap: async()=>guarded(image), dumpLayout:async()=>guarded('<hierarchy><node bounds="[0,0][360,720]" type="Column" id="root"><node bounds="[20,40][340,100]" type="Text" text="Example screen"/><node bounds="[20,130][340,200]" type="Button" text="Continue" clickable="true"/></node></hierarchy>'),
  createShell:async()=>{await guarded(null);const id='shell-'+next++;setTimeout(()=>emit('shellData',id,'Simulated device session\r\n$ '),150);return id},writeShell:async(id,text)=>emit('shellData',id,text),killShell:async()=>{},
  openHilog:async()=>{await guarded(null);const id='hilog-'+next++;setTimeout(()=>emit('hilogEntry',id,{date:new Date(),pid:1234,tid:1234,level:4,type:0,domain:'0001',tag:'Sample',bundleName:'com.example.notes',message:'Simulated log entry: renderer preview ready.'}),150);return id},closeHilog:async()=>{},pauseHilog:async()=>{},resumeHilog:async()=>{},
  getLogs:async()=>['Simulated application log — UI verification only\n'],clearLogs:async()=>{},getCpuAndMem:async()=>({cpu:1.2,memory:1024*128}),getProcessData:async()=>[{name:'Main process (sample)',pid:100,memory:128000,cpu:1.2,type:'Browser',webContentsId:0}],
  showOpenDialog:async()=>({canceled:true,filePaths:[]}),isCustomTitlebar:async()=>false,
  showContextMenu:async()=>{},openExternal:async()=>{},openWindow:async()=>{},openDevtools:async()=>{},debugMainProcess:async()=>{},killProcess:async()=>{},
  showScreencast:async()=>{throw new Error('Visual fixture only')},openHdcCli:async()=>{throw new Error('Visual fixture only')},relaunch:async()=>{},
}
contextBridge.exposeInMainWorld('main',main)
contextBridge.exposeInMainWorld('preload',{setTitle:()=>{},getPathForFile:()=>''})
contextBridge.exposeInMainWorld('node',{existsSync:()=>false})
async function syncTheme() {
  const theme = await ipcRenderer.invoke('fixture-theme')
  if (document.body) document.body.classList.toggle('-theme-with-dark-background',theme==='dark')
  emit('updateTheme')
}
ipcRenderer.on('fixture-theme-updated',()=>void syncTheme())
window.addEventListener('DOMContentLoaded',()=>void syncTheme())
