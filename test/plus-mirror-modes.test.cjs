const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild')
function load(path,mocks={}){const module={exports:{}};vm.runInNewContext(transformSync(fs.readFileSync(path,'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(id)});return module.exports}
test('layout filtering affects only selected sessions and preserves other device windows',()=>{
 const calls=[];let merged
 const{applyMirrorLayout}=load('src/main/window/mirrorLayout.ts',{'./mergedMirrors':{showMergedMirrors:provider=>{merged=provider},closeMergedMirrors:()=>calls.push('close-merged')},'./arrangeMirrors':{arrangeMirrors:windows=>calls.push(windows.map(w=>w.name))}})
 const sources=['a','h','ios:airplay-receiver'].map((deviceKey,index)=>({deviceKey,platform:['android','harmony','ios'][index],window:{name:deviceKey,isDestroyed:()=>false,isMinimized:()=>false,show(){calls.push(this.name)}}}));const provider=()=>sources
 applyMirrorLayout({layout:'merged',deviceKeys:['a','h']},provider,{})
 assert.deepEqual(Array.from(merged(),s=>s.deviceKey),['a','h'])
 applyMirrorLayout({layout:'side-by-side',deviceKeys:['a','h']},provider,{})
 assert.deepEqual(calls,['close-merged',['a','h']])
 applyMirrorLayout({layout:'independent',deviceKeys:['ios:airplay-receiver']},provider,{})
 assert.equal(calls.at(-1),'ios:airplay-receiver')
 assert.throws(()=>applyMirrorLayout({layout:'other'},provider,{}),/Invalid/)
 assert.throws(()=>applyMirrorLayout({layout:'merged',deviceKeys:[]},provider,{}),/No active/)
 assert.throws(()=>applyMirrorLayout({layout:'merged',deviceKeys:'all'},provider,{}),/Invalid/)
})
test('focus restores existing windows and merged views without starting a session; layout readback tracks actual windows',()=>{
 let mergedWindow;const calls=[]
 const {applyMirrorLayout,getMirrorLayout,focusMirror}=load('src/main/window/mirrorLayout.ts',{'./mergedMirrors':{
  getMergedMirrorWindow:key=>!key||key==='a'?mergedWindow:undefined,
  showMergedMirrors:()=>{mergedWindow={isMinimized:()=>true,restore:()=>calls.push('restore-merged'),show:()=>{},focus:()=>calls.push('focus-merged')}},
  closeMergedMirrors:()=>{mergedWindow=undefined}},'./arrangeMirrors':{arrangeMirrors:()=>{}}})
 let bounds={x:0,y:0,width:300,height:600}
 const win={id:1,isDestroyed:()=>false,isMinimized:()=>true,restore:()=>calls.push('restore'),show:()=>calls.push('show'),focus:()=>calls.push('focus'),getBounds:()=>bounds}
 const provider=()=>[{deviceKey:'a',window:win}]
 assert.equal(typeof focusMirror,'function')
 focusMirror('a',provider);assert.deepEqual(calls,['restore','show','focus'])
 assert.throws(()=>focusMirror('gone',provider),/No active/)
 applyMirrorLayout({layout:'side-by-side'},provider,{})
 assert.equal(getMirrorLayout(provider),'side-by-side')
 bounds={...bounds,x:10};assert.equal(getMirrorLayout(provider),'independent')
 applyMirrorLayout({layout:'merged'},provider,{})
 assert.equal(getMirrorLayout(provider),'merged');focusMirror('a',provider)
 assert.equal(calls.at(-1),'focus-merged')
 mergedWindow=undefined;assert.equal(getMirrorLayout(provider),'independent')
})
