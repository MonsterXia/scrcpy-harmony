const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm')
const {transformSync}=require('esbuild')
test('three platform windows fit side by side without overlapping or leaving the display',()=>{
 const module={exports:{}}
 vm.runInNewContext(transformSync(fs.readFileSync('src/main/window/arrangeMirrors.ts','utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports})
 const area={x:100,y:60,width:1440,height:900}
 const windows=[{width:420,height:850},{width:390,height:860},{width:430,height:920}].map(bounds=>({
  bounds,isDestroyed:()=>false,isMinimized:()=>false,isMaximized:()=>false,isFullScreen:()=>false,
  getBounds(){return this.bounds},setMinimumSize(){},setBounds(value){this.bounds=value},show(){this.shown=true},
 }))
 module.exports.arrangeMirrors(windows,area)
 for(const win of windows){const b=win.bounds;assert.equal(win.shown,true);assert.ok(b.x>=area.x&&b.y>=area.y&&b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height)}
 assert.ok(windows[0].bounds.x+windows[0].bounds.width<windows[1].bounds.x)
 assert.ok(windows[1].bounds.x+windows[1].bounds.width<windows[2].bounds.x)
})
