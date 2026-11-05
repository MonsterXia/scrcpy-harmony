const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const{EventEmitter}=require('node:events'),{transformSync}=require('esbuild')
function fixture(){let nextSource=0;const handlers=new Map(),created=[];const module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync('src/main/window/mergedMirrors.ts','utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,require(id){if(id==='electron')return{ipcMain:{handle:(key,fn)=>handlers.set(key,fn)}};if(id==='share/main/lib/window')return{create(){const w=new EventEmitter();w.webContents={mainFrame:{}};w.isDestroyed=()=>false;w.show=w.focus=()=>{};w.close=()=>{};created.push(w);return w},loadPage(){}};return require(id)}})
 const source=platform=>{const contents={throttled:true,isDestroyed:()=>false,getBackgroundThrottling(){return this.throttled},setBackgroundThrottling(v){this.throttled=v},async executeJavaScript(code){assert.match(code,/querySelector\('canvas'\)/);assert.match(code,/toBlob/);assert.doesNotMatch(code,/toDataURL/);return{image:'data:image/jpeg;base64,fixture',width:100,height:200}}};const window=new EventEmitter();Object.assign(window,{id:++nextSource,visible:true,isDestroyed:()=>false,isMinimized:()=>false,webContents:contents,hide(){this.visible=false},show(){this.visible=true;this.emit('show')}});return{platform,window}}
 return{...module.exports,handlers,created,source,invoke(event){return handlers.get('getMergedMirrorFrames')(event||{sender:created.at(-1).webContents,senderFrame:created.at(-1).webContents.mainFrame})}}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve))
test('merged mode hides sources immediately, keeps late ready-to-show hidden, and restores them on close',async()=>{
 const f=fixture(),sources=['harmony','android','ios'].map(f.source);f.showMergedMirrors(()=>sources);f.showMergedMirrors(()=>sources);assert.equal(f.created.length,1)
 assert.ok(sources.every(s=>!s.window.visible&&!s.window.webContents.throttled));sources[0].window.show();assert.equal(sources[0].window.visible,false)
 f.invoke();await settle();const frames=f.invoke();assert.deepEqual(Array.from(frames,f=>f.platform),['android','harmony','ios']);assert.ok(frames.every(f=>f.image&&f.width===100))
 f.created[0].emit('closed');assert.ok(sources.every(s=>s.window.webContents.throttled&&s.window.visible));assert.ok(sources.every(s=>s.window.listenerCount('show')===0))
})
test('merged capture rejects other windows and subframes',()=>{
 const f=fixture();f.showMergedMirrors(()=>[f.source('android')]);assert.throws(()=>f.invoke({sender:{},senderFrame:{}}),/document/)
 assert.throws(()=>f.invoke({sender:f.created[0].webContents,senderFrame:{}}),/document/)
 f.created[0].emit('closed')
})
test('a stalled source never blocks other sources and repeated polls cannot queue captures',async()=>{
 const f=fixture(),android=f.source('android'),ios=f.source('ios');let complete,calls=0
 android.window.webContents.executeJavaScript=()=>{calls++;return new Promise(resolve=>{complete=resolve})}
 f.showMergedMirrors(()=>[android,ios]);for(let i=0;i<20;i++)f.invoke();assert.equal(calls,1)
 await settle();let frames=f.invoke();assert.equal(frames[0].image,'');assert.ok(frames[1].image)
 complete({image:'data:image/jpeg;base64,ok',width:100,height:200});await settle();frames=f.invoke();assert.ok(frames[0].image);assert.ok(frames[1].image)
 f.created[0].emit('closed')
})
test('switching merge providers restores excluded windows and prevents late stale frames leaking',async()=>{
 const f=fixture(),android=f.source('android'),ios=f.source('ios');let complete
 ios.window.webContents.executeJavaScript=()=>new Promise(resolve=>{complete=resolve})
 f.showMergedMirrors(()=>[android,ios]);f.invoke();await settle()
 f.showMergedMirrors(()=>[android]);assert.equal(ios.window.visible,true);assert.equal(ios.window.webContents.throttled,true)
 complete({image:'old',width:100,height:200});await settle();const frames=f.invoke();assert.equal(frames.length,1);assert.equal(frames[0].platform,'android')
 f.created[0].emit('closed')
})
test('explicit layout close restores sources immediately; an old delayed close cannot affect the new view',async()=>{
 const f=fixture(),source=f.source('android');f.showMergedMirrors(()=>[source]);f.invoke();await settle();f.closeMergedMirrors();assert.equal(source.window.visible,true);assert.equal(source.window.webContents.throttled,true)
 f.showMergedMirrors(()=>[source]);f.created[0].emit('closed');assert.equal(source.window.visible,false);assert.equal(source.window.webContents.throttled,false)
 f.invoke();await settle();assert.ok(f.invoke()[0].image);f.created[1].emit('closed');assert.equal(source.window.visible,true)
})
test('a failed export retains the last good picture and retries later',async()=>{
 const f=fixture(),source=f.source('android');f.showMergedMirrors(()=>[source]);f.invoke();await settle();source.window.webContents.executeJavaScript=async()=>{throw Error('temporary')}
 assert.ok(f.invoke()[0].image);await settle();assert.ok(f.invoke()[0].image);f.created[0].emit('closed')
})
test('late sources are hidden and pre-existing background policy is preserved',async()=>{
 const f=fixture(),android=f.source('android'),harmony=f.source('harmony');harmony.window.webContents.throttled=false
 const sources=[android];f.showMergedMirrors(()=>sources);sources.push(harmony);f.invoke();await settle();assert.equal(harmony.window.visible,false)
 f.closeMergedMirrors();assert.equal(harmony.window.visible,true);assert.equal(harmony.window.webContents.throttled,false)
})

test('every hidden source has its own exported frame even when two sources have the same platform',async()=>{
 const f=fixture(),sources=['android','android','harmony','harmony','ios'].map(f.source)
 f.showMergedMirrors(()=>sources);f.invoke();await settle();const frames=f.invoke()
 assert.equal(frames.length,5);assert.equal(new Set(frames.map(frame=>frame.sourceId)).size,5)
 assert.deepEqual(Array.from(frames,frame=>frame.platform),['android','android','harmony','harmony','ios'])
 assert.ok(frames.every(frame=>frame.image));assert.ok(sources.every(s=>!s.window.visible))
 f.closeMergedMirrors();assert.ok(sources.every(s=>s.window.visible))
})
