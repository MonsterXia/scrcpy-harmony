import { spawn } from 'node:child_process'
import { AutomationFault, checkContext, MAX_REQUEST_BYTES } from '../../../common/automation/protocol'
import type { AutomationContext } from '../../../common/automation/protocol'
interface Endpoint { bin: string; host: string; port: number }
export interface HostCapture { bytes: Buffer; truncated: boolean; durationMs: number }
// Own just this invocation, never the shared HDC server or another user's tool.
export async function runHostCommand(endpoint: Endpoint, key: string, args: string[], context: AutomationContext): Promise<string> {
  return (await executeHost(endpoint,key,args,context)).bytes.toString('utf8')
}
export function captureHostOutput(endpoint: Endpoint,key: string,args: string[],context: AutomationContext,durationMs: number,maxBytes: number) {
  if (!Number.isInteger(durationMs) || durationMs<1 || durationMs>60000 || !Number.isInteger(maxBytes) || maxBytes<1 || maxBytes>MAX_REQUEST_BYTES) throw new AutomationFault('INVALID_ARGUMENT','Invalid log capture duration or size')
  return executeHost(endpoint,key,args,context,{durationMs,maxBytes})
}
function executeHost(endpoint: Endpoint,key: string,args: string[],context: AutomationContext,capture?: {durationMs:number;maxBytes:number}): Promise<HostCapture> {
  checkContext(context)
  return new Promise((resolve,reject) => {
    let reason: AutomationFault | undefined, settled=false, stopping=false, truncated=false, captured=false
    let force: ReturnType<typeof setTimeout> | undefined, duration: ReturnType<typeof setTimeout> | undefined
    const began=Date.now(),maximum=capture?.maxBytes ?? MAX_REQUEST_BYTES
    const child=spawn(endpoint.bin,['-s',`${endpoint.host}:${endpoint.port}`,'-t',key,...args],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']})
    const chunks: Buffer[]=[];let size=0,errors=0
    const finish=(error?: AutomationFault)=>{
      if(settled)return
      settled=true;clearTimeout(timer);clearTimeout(force);clearTimeout(duration);context.signal.removeEventListener('abort',cancel)
      if(error)reject(error);else resolve({bytes:Buffer.concat(chunks),truncated,durationMs:Date.now()-began})
    }
    const stop=(fault?: AutomationFault)=>{
      if(settled)return
      if(fault&&!reason)reason=fault
      if(stopping)return
      stopping=true;child.kill('SIGTERM')
      force=setTimeout(()=>{child.kill('SIGKILL');finish(reason||new AutomationFault('OUTCOME_UNKNOWN','HDC reader cleanup was not confirmed','unknown'))},5000)
    }
    const cancel=()=>stop(new AutomationFault('CANCELLED','Host command cancelled; device outcome is unknown','unknown'))
    const timer=setTimeout(()=>stop(new AutomationFault('TIMEOUT','Host command timed out; device outcome is unknown','unknown')),Math.max(1,context.deadline-Date.now()))
    context.signal.addEventListener('abort',cancel,{once:true})
    if(capture)duration=setTimeout(()=>{captured=true;stop()},capture.durationMs)
    child.stdout.on('data',(chunk: Buffer)=>{
      if(stopping)return
      const remaining=maximum-size
      if(chunk.length>remaining){
        if(capture){chunks.push(chunk.subarray(0,remaining));size+=remaining;truncated=true;captured=true;stop()}
        else stop(new AutomationFault('OUTCOME_UNKNOWN','Host command output exceeded its limit','unknown'))
      }else{size+=chunk.length;chunks.push(chunk)}
    })
    child.stderr.on('data',(chunk: Buffer)=>{errors+=chunk.length;if(errors>65536)stop(new AutomationFault('OUTCOME_UNKNOWN','Host command diagnostic output exceeded its limit','unknown'))})
    child.stdout.on('error',()=>stop(new AutomationFault('OUTCOME_UNKNOWN','Host output stream failed','unknown')))
    child.stderr.on('error',()=>stop(new AutomationFault('OUTCOME_UNKNOWN','Host diagnostic stream failed','unknown')))
    child.on('error',()=>finish(reason||new AutomationFault('UNAVAILABLE','Could not launch the configured HDC client')))
    child.on('close',code=>finish(reason||((code===0||captured)?undefined:new AutomationFault('OUTCOME_UNKNOWN','HDC client did not confirm success','unknown'))))
    if(context.signal.aborted)cancel()
  })
}
