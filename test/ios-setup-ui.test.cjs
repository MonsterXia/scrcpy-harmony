const {test}=require('node:test'),assert=require('node:assert/strict')
const { load: loadRenderer } = require('./helpers/workspace-renderer.cjs')
const fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild'),{JSDOM}=require('jsdom')
test('login shows progress immediately while IPC is pending and displays a returned failure',async()=>{
 const dom=new JSDOM('<div id="root"></div>')
 const previous={window:global.window,document:global.document,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT}
 Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})
 const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React
 const module={exports:{}};let finish, poll, readyCalls=0
 const main={iosSetup:async action=>{
  if(action.action==='status') return {phase:'idle'}
  if(action.action==='cancel') return {phase:'cancelled'}
  return new Promise(r=>{finish=r})
 }}
 vm.runInNewContext(transformSync(fs.readFileSync('src/renderer/native-mirror/IosSetup.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,{
  module,exports:module.exports,main,setInterval:fn=>{poll=fn;return 0},clearInterval:()=>{},require(id) {
   if (id.startsWith('share/renderer/dialog/')) {
     return loadRenderer('src/' + id + '.tsx')
   }
   if(id==='common/util')return {t:key=>key}
   if(id.endsWith('.scss'))return {}
   return require(id)
  }
 })
 const root=createRoot(document.getElementById('root'))
 try {
  await act(async()=>root.render(React.createElement(module.exports.default,{onReady:()=>{readyCalls++},onClose:()=>{}})))
  await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(document.querySelector('[role="status"]').textContent,'iosSetupAuthenticating')
  await act(async()=>finish({phase:'error',error:'helper-unavailable'}))
  assert.equal(document.querySelector('[role="alert"]').textContent,'iosSetupHelperMissing')
  await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
  await act(poll)
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='cancel').click())
  await act(async()=>finish({phase:'ready'}))
  assert.equal(document.querySelector('[role="status"]').textContent,'iosSetupCancelled')
  assert.equal(readyCalls,0)
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(global,previous)}
})
