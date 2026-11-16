import { spawn } from 'node:child_process'
import { AutomationFault, checkContext, MAX_REQUEST_BYTES } from '../../../common/automation/protocol'
import type { AutomationContext } from '../../../common/automation/protocol'
// Own just this invocation, never the shared HDC server or another user's tool.
export function runHostCommand(endpoint: { bin: string; host: string; port: number }, key: string, args: string[], context: AutomationContext): Promise<string> {
  checkContext(context)
  return new Promise((resolve,reject) => {
    let reason: AutomationFault | undefined, settled=false, force: ReturnType<typeof setTimeout> | undefined
    const child=spawn(endpoint.bin,['-s',`${endpoint.host}:${endpoint.port}`,'-t',key,...args],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']})
    const chunks: Buffer[]=[];let size=0,errors=0
    const finish=(error?: AutomationFault)=>{
      if(settled)return
      settled=true;clearTimeout(timer);clearTimeout(force);context.signal.removeEventListener('abort',cancel)
      if(error)reject(error);else resolve(Buffer.concat(chunks).toString('utf8'))
    }
    const stop=(fault: AutomationFault)=>{
      if(reason||settled)return
      reason=fault;child.kill('SIGTERM')
      force=setTimeout(()=>{child.kill('SIGKILL');finish(reason)},5000)
    }
    const cancel=()=>stop(new AutomationFault('CANCELLED','Host command cancelled; device outcome is unknown','unknown'))
    const timer=setTimeout(()=>stop(new AutomationFault('TIMEOUT','Host command timed out; device outcome is unknown','unknown')),Math.max(1,context.deadline-Date.now()))
    context.signal.addEventListener('abort',cancel,{once:true})
    child.stdout.on('data',(chunk: Buffer)=>{size+=chunk.length;if(size>MAX_REQUEST_BYTES)stop(new AutomationFault('OUTCOME_UNKNOWN','Host command output exceeded its limit','unknown'));else chunks.push(chunk)})
    child.stderr.on('data',(chunk: Buffer)=>{errors+=chunk.length;if(errors>65536)stop(new AutomationFault('OUTCOME_UNKNOWN','Host command diagnostic output exceeded its limit','unknown'))})
    child.on('error',()=>finish(new AutomationFault('UNAVAILABLE','Could not launch the configured HDC client')))
    child.on('close',code=>finish(reason||(code===0?undefined:new AutomationFault('OUTCOME_UNKNOWN','HDC client did not confirm success','unknown'))))
    if(context.signal.aborted)cancel()
  })
}
