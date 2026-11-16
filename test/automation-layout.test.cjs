const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-automation.cjs')
test('shared layout export escapes XML attributes without mutating the captured tree',()=>{
 const {toHierarchyXml}=load('src/main/lib/hdc/layoutXml.ts')
 const tree={attributes:{type:'Text',text:'a & "b" <c>',id:'test'},children:[]};const before=JSON.stringify(tree)
 assert.equal(toHierarchyXml(tree),'<Text text="a &amp; &quot;b&quot; &lt;c&gt;" id="test"></Text>');assert.equal(JSON.stringify(tree),before)
})
test('layout export rejects excessive size and cyclic trees instead of partial XML',()=>{
 const {toHierarchyXml}=load('src/main/lib/hdc/layoutXml.ts');const tree={attributes:{type:'Node'},children:[]};tree.children.push(tree)
 assert.throws(()=>toHierarchyXml(tree),/layout/)
 assert.throws(()=>toHierarchyXml({attributes:{type:'Node',text:'a'.repeat(1024*1024)},children:[]}),/layout/)
})
