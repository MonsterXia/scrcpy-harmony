const {test}=require('node:test'),assert=require('node:assert/strict')
const load=require('./helpers/load-automation.cjs')
test('binary frame envelope roundtrips raw bytes without JSON/base64 inflation',()=>{
 const {encodeResult,decodeResult}=load('src/common/automation/wire.ts')
 const value={apiVersion:1,requestId:'a',ok:true,data:{frame:{width:2,height:3},bytes:Uint8Array.from([0,255,13])}}
 const encoded=encodeResult(value);assert.equal(encoded.type,'application/vnd.scrcpy-plus.frame')
 const decoded=decodeResult(encoded.body,encoded.type);assert.deepEqual(decoded.data.frame,value.data.frame);assert.deepEqual([...decoded.data.bytes],[0,255,13])
})
test('malformed and oversized binary payloads fail before returning a frame',()=>{
 const {encodeResult,decodeResult}=load('src/common/automation/wire.ts')
 assert.throws(()=>decodeResult(Buffer.alloc(3),'application/vnd.scrcpy-plus.frame'))
 assert.throws(()=>decodeResult(Buffer.from([0,0,255,255]),'application/vnd.scrcpy-plus.frame'))
 assert.throws(()=>encodeResult({ok:true,data:{frame:{},bytes:new Uint8Array(32*1024*1024+1)}}),{code:'INTERNAL'})
 assert.throws(()=>decodeResult(Buffer.from('{}'),'text/plain'),{code:'INTERNAL'})
})
