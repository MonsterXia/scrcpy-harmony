const{test}=require('node:test'),assert=require('node:assert/strict')
const{setup,load,React}=require('./helpers/workspace-renderer.cjs');const createRoot=setup(),{act}=React
test('merged frame contains only system names and three images',async t=>{
 const main={getMergedMirrorFrames:async()=>['android','ios','harmony'].map(platform=>({platform,image:'data:image/png;base64,fixture',width:10,height:20}))}
 const App=load('src/renderer/merged-mirror/App.tsx',{}, {main}).default
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 t.after(async()=>{await act(async()=>root.unmount());host.remove()})
 await act(async()=>root.render(React.createElement(App)))
 assert.deepEqual([...host.querySelectorAll('h1')].map(h=>h.textContent),['Android','HarmonyOS','iOS'])
 assert.equal(host.textContent,'AndroidHarmonyOSiOS')
 assert.equal(host.querySelectorAll('img').length,3)
 assert.equal(host.querySelectorAll('button,input,p').length,0)
})
for(const platforms of [['android'],['android','harmony']])test(`merged view uses ${platforms.length} columns without unused system slots`,async t=>{
 const main={getMergedMirrorFrames:async()=>platforms.map(platform=>({platform,image:'data:image/png;base64,fixture',width:10,height:20}))}
 const App=load('src/renderer/merged-mirror/App.tsx',{}, {main}).default
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 t.after(async()=>{await act(async()=>root.unmount());host.remove()})
 await act(async()=>root.render(React.createElement(App)))
 assert.equal(host.querySelectorAll('h1').length,platforms.length)
 assert.equal(host.querySelectorAll('img').length,platforms.length)
 assert.equal(host.querySelector('[data-platform="ios"]'),null)
 assert.match(host.querySelector('main').style.gridTemplateColumns,new RegExp(`repeat\\(${platforms.length},`))
})

test('merged UI keeps separate columns for two devices running the same OS',async t=>{
 const main={getMergedMirrorFrames:async()=>['android','android','harmony'].map((platform,index)=>({sourceId:index+1,platform,image:'data:image/jpeg;base64,fixture',width:10,height:20}))}
 const App=load('src/renderer/merged-mirror/App.tsx',{}, {main}).default
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 t.after(async()=>{await act(async()=>root.unmount());host.remove()})
 await act(async()=>root.render(React.createElement(App)))
 assert.deepEqual([...host.querySelectorAll('h1')].map(h=>h.textContent),['Android','Android','HarmonyOS'])
 assert.equal(host.querySelectorAll('[data-platform="android"] img').length,2)
 assert.equal(new Set([...host.querySelectorAll('[data-source]')].map(n=>n.dataset.source)).size,3)
})
