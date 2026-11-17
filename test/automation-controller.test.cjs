const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const load=require('./helpers/load-automation.cjs')
const target={key:'android:a',platform:'android',name:'Test device'}
const ctx=(clientId='a')=>({clientId,deadline:Date.now()+1000,signal:new AbortController().signal})
function fixture(){
 const {AutomationController}=load('src/main/automation/controller.ts');const handlers=new Map(),windows=[],calls=[];let controller
 controller=new AutomationController({instanceId:'instance',ipc:{handle:(n,f)=>handlers.set(n,f)},discover:async()=>({targets:[target],errors:[]}),open:async(t,gui)=>{
   const win=new EventEmitter();win.webContents=Object.assign(new EventEmitter(),{mainFrame:{},isDestroyed:()=>!!win.destroyed,send:(_n,r)=>{if(win.meta)queueMicrotask(()=>handlers.get('automationFrameResult')({sender:win.webContents,senderFrame:win.webContents.mainFrame},r.requestId,{ok:true,metadata:win.meta,...(r.method==='capture'?{png:png(win.meta)}:{})}))}})
   win.hide=()=>{win.hidden=true};win.show=()=>{win.hidden=false};win.focus=()=>{};win.isDestroyed=()=>!!win.destroyed
   win.hook=controller.attach({target:t,window:win,gui,close:async()=>{win.destroyed=true;win.hook.closed()}});windows.push(win)
 },input:()=>({touch:async phase=>{calls.push(phase)},text:async()=>{},key:async()=>{},scroll:async()=>{}})})
 function present(win,sequence=1){win.meta={sequence,width:2,height:3,capturedAt:Date.now(),rotation:0,generation:1};handlers.get('automationFrameState')({sender:win.webContents,senderFrame:win.webContents.mainFrame},{state:'presented',metadata:win.meta})}
 return {controller,windows,present,calls}
}
function png(meta){const b=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(meta.width,16);b.writeUInt32BE(meta.height,20);return b}
test('controller shares GUI and automation ownership and only a presentation makes a session running',async()=>{
 const f=fixture();const a=await f.controller.start(target.key,ctx());const b=await f.controller.start(target.key,ctx('b'))
 assert.equal(a.state,'starting');assert.equal(a.sessionId,b.sessionId);assert.equal(f.windows.length,1)
 const win=f.windows[0];win.hook.state('connected');assert.equal(f.controller.sessions.get(a.sessionId).state,'starting')
 f.present(win);assert.equal(f.controller.sessions.get(a.sessionId).state,'running')
 win.hook.guiOpened();assert.equal(win.hook.closeRequested(),true);assert.equal(win.hidden,true)
 await f.controller.sessions.release(a.sessionId,a.leaseId,ctx());assert.equal(win.destroyed,undefined)
 await f.controller.sessions.release(b.sessionId,b.leaseId,ctx('b'));assert.equal(win.destroyed,true)
})
test('capture uses rendered bytes and input needs a lease and a current frame reference',async()=>{
 const f=fixture();const a=await f.controller.start(target.key,ctx());f.present(f.windows[0])
 const capture=await f.controller.capture(a.sessionId,{},ctx());assert.equal(capture.bytes.length,24)
 await assert.rejects(f.controller.input(a.sessionId,{type:'tap',x:1,y:1},capture.frame.frameId,ctx('other')),{code:'UNAUTHORIZED'})
 const action=await f.controller.input(a.sessionId,{type:'tap',x:1,y:1},capture.frame.frameId,ctx());assert.deepEqual(f.calls,['down','up'])
 await assert.rejects(f.controller.capture(a.sessionId,{afterAction:action.observationToken},{...ctx(),deadline:Date.now()+30}),{code:'TIMEOUT'})
 f.present(f.windows[0],2);const next=await f.controller.capture(a.sessionId,{afterAction:action.observationToken},ctx());assert.equal(next.frame.sequence,2)
})
test('disconnect invalidates observations and quarantines pending input',async()=>{
 const f=fixture();const a=await f.controller.start(target.key,ctx());f.present(f.windows[0]);const capture=await f.controller.capture(a.sessionId,{},ctx())
 f.windows[0].hook.state('disconnected')
 await assert.rejects(f.controller.input(a.sessionId,{type:'tap',x:1,y:1},capture.frame.frameId,ctx()),{code:'UNAVAILABLE'})
 assert.equal(f.controller.sessions.get(a.sessionId).state,'disconnected')
})
test('renderer crash invalidates observations immediately and closes its owned backend',async()=>{
 const f=fixture();const a=await f.controller.start(target.key,ctx());f.present(f.windows[0]);f.windows[0].webContents.emit('render-process-gone')
 assert.equal(f.controller.sessions.get(a.sessionId).state,'error')
 await assert.rejects(f.controller.capture(a.sessionId,{},ctx()),{code:'UNAVAILABLE'})
 await new Promise(setImmediate);assert.equal(f.windows[0].destroyed,true)
 assert.equal(f.controller.sessions.get(a.sessionId).state,'stopped')
})
test('window destruction uses captured webContents without reading the destroyed native window',async()=>{
 const f=fixture();const a=await f.controller.start(target.key,ctx());const win=f.windows[0],contents=win.webContents
 Object.defineProperty(win,'webContents',{get(){if(win.destroyed)throw Error('Object has been destroyed');return contents}})
 await f.controller.sessions.release(a.sessionId,a.leaseId,ctx())
 assert.equal(f.controller.sessions.get(a.sessionId).state,'stopped')
})

test('opening an automation mirror claims GUI ownership without revealing a merged source', async () => {
 const f=fixture(), lease=await f.controller.start(target.key,ctx()), win=f.windows[0]
 win.hidden=true;win.isMinimized=()=>false
 let mergedFocus=0
 const merged={isMinimized:()=>false,show:()=>{},focus:()=>{mergedFocus++}}
 const {focusMirror}=load('src/main/window/mirrorLayout.ts',{
  './mergedMirrors':{getMergedMirrorWindow:()=>merged},'./arrangeMirrors':{arrangeMirrors:()=>{}}
 })
 focusMirror(target.key,()=>[{deviceKey:target.key,window:win,claimGui:()=>win.hook.guiOpened(false)}])
 assert.equal(mergedFocus,1);assert.equal(win.hidden,true,'ownership claim must not reveal merged source')
 await f.controller.sessions.release(lease.sessionId,lease.leaseId,ctx())
 assert.equal(win.destroyed,undefined,'GUI retains the backend after the last automation lease')
 assert.equal(win.hook.closeRequested(),false)
 await f.controller.sessions.terminate(lease.sessionId)
 assert.equal(win.destroyed,true)
})

test('transport recovery waits for a fresh presentation and never revives a stopped session',async()=>{
 const f=fixture(),a=await f.controller.start(target.key,ctx()),win=f.windows[0]
 f.present(win);win.hook.state('disconnected');win.hook.state('connected')
 assert.equal(f.controller.sessions.get(a.sessionId).state,'starting')
 f.present(win,2);assert.equal(f.controller.sessions.get(a.sessionId).state,'running')
 win.hook.state('stopping');win.hook.state('connected');f.present(win,3)
 assert.equal(f.controller.sessions.get(a.sessionId).state,'stopping')
 await f.controller.sessions.release(a.sessionId,a.leaseId,ctx())
})
