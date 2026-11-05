const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild')
function load(path,mocks={}){const module={exports:{}};vm.runInNewContext(transformSync(fs.readFileSync(path,'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(id)});return module.exports}
const devices=[{key:'a',platform:'android',state:'ready'},{key:'h',platform:'harmony',state:'ready'},{key:'off',platform:'android',state:'offline'},{key:'locked',platform:'android',state:'unauthorized'},{key:'usb-ios',platform:'ios',state:'ready'},{key:'ios:airplay-receiver',platform:'ios',transport:'receiver',state:'waiting'}]
test('startup modes select one device, Android/Harmony, or all platforms without duplicate iOS receivers',()=>{
 const{targetsForMode,mirrorDeviceKey}=load('src/renderer/main/components/devices/modes.ts');const ids=(mode,key)=>Array.from(targetsForMode(devices,mode,key),d=>d.key)
 assert.deepEqual(ids('single','a'),['a']);assert.deepEqual(ids('single','h'),['h']);assert.deepEqual(ids('single','usb-ios'),['usb-ios'])
 assert.deepEqual(ids('single','off'),[]);assert.deepEqual(ids('single','locked'),[]);assert.deepEqual(ids('single','gone'),[])
 assert.deepEqual(ids('android-harmony'),['a','h']);assert.deepEqual(ids('all'),['a','h','ios:airplay-receiver'])
 assert.equal(mirrorDeviceKey(devices[4]),'ios:airplay-receiver')
})
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
