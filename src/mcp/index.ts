import { Server } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { randomUUID } from 'node:crypto'
import * as path from 'node:path'
import { callAutomation, resolveClientId } from '../cli/client'
import { defaultProfile } from '../cli/profile'
import { AutomationFault, failure, isRecord, operations, parseRequest, publicSchema, success } from '../common/automation/protocol'
import type { AutomationResult } from '../common/automation/protocol'
import { version } from '../../package.json'

const names = new Map(Object.keys(operations).map(name => [name.replace(/[.-]/g,'_'),name]))
const nonDestructive = new Set(['devices.list','devices.capabilities','sessions.start'])
export function createMcpServer(profilePath: string, clientName: string) {
  const server = new Server({name:'scrcpy-plus',version},{capabilities:{tools:{}}})
  server.setRequestHandler('tools/list',async()=>({tools:Array.from(names,([name,operation])=>{
    const definition=operations[operation]
    return {name,description:definition.description,inputSchema:{type:'object' as const,properties:{...definition.parameters,timeoutMs:{type:'integer',minimum:1,maximum:600000}},required:[...definition.required],additionalProperties:false},annotations:{readOnlyHint:definition.readOnly,destructiveHint:!definition.readOnly&&!nonDestructive.has(operation),idempotentHint:definition.readOnly,openWorldHint:true}}
  })}))
  server.setRequestHandler('tools/call',async(request,ctx)=>{
    const requestId=randomUUID()
    let result: AutomationResult
    try {
      const operation=names.get(request.params.name)
      if (!operation) throw new AutomationFault('INVALID_ARGUMENT','Unknown automation tool')
      const args=request.params.arguments ?? {}
      const {timeoutMs,...params}=args
      const parsed=parseRequest({apiVersion:1,requestId,clientId:'offline',operation,params,timeoutMs})
      const deadline=Date.now()+parsed.timeoutMs
      if (operation==='schema') result=success(requestId,publicSchema())
      else {
        const clientId=await resolveClientId(profilePath,clientName)
        result=await callAutomation({...parsed,clientId},{profilePath,deadline,signal:ctx.mcpReq.signal})
      }
    } catch(error) { result=failure(requestId,error) }
    return toMcpResult(result)
  })
  return server
}
function toMcpResult(result: AutomationResult) {
  const content: Array<{type:'text';text:string}|{type:'image';data:string;mimeType:string}|{type:'resource';resource:{uri:string;mimeType:string;blob:string}}>=[]
  let structuredContent: Record<string,unknown> = {...result}
  if (result.ok && isRecord(result.data) && result.data.bytes instanceof Uint8Array) {
    const {bytes,...data}=result.data
    structuredContent={...result,data}
    if (isRecord(data.frame)) content.push({type:'image',data:Buffer.from(bytes).toString('base64'),mimeType:'image/png'})
    else if (isRecord(data.artifact)) content.push({type:'resource',resource:{uri:`urn:uuid:${data.artifact.artifactId}`,mimeType:String(data.artifact.mimeType),blob:Buffer.from(bytes).toString('base64')}})
    else throw new AutomationFault('INTERNAL','Invalid binary tool result')
  }
  content.unshift({type:'text',text:JSON.stringify(structuredContent)})
  return {content,structuredContent,isError:!result.ok}
}
function options(argv: string[]) {
  const values: Record<string,string>={}
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1]
    if(!['--profile','--client'].includes(key)||Object.hasOwn(values,key)||!value||value.startsWith('--')) throw new AutomationFault('INVALID_ARGUMENT','Use --profile <absolute-path> and --client <name>')
    values[key]=value
  }
  const profilePath=values['--profile'] ?? defaultProfile(),client=values['--client'] ?? 'mcp'
  if(!path.isAbsolute(profilePath)||!/^[a-zA-Z0-9_-]{1,64}$/.test(client)) throw new AutomationFault('INVALID_ARGUMENT','Invalid profile path or client name')
  return {profilePath,client}
}
if(require.main===module){
  try {
    const args=options(process.argv.slice(2)),handle=serveStdio(()=>createMcpServer(args.profilePath,args.client))
    const stop=()=>{void handle.close().catch(()=>{process.exitCode=1})}
    process.once('SIGINT',stop);process.once('SIGTERM',stop)
  } catch { process.stderr.write('Invalid MCP startup options\n');process.exitCode=2 }
}
