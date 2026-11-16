import { Client } from 'hdckit'
import type { DeviceOperationContext } from '../../../common/automation/deviceContext'
import map from 'licia/map'
import { handleEvent } from 'share/main/lib/util'

let client: Client

export const listForwards = async function (connectKey: string, context?: DeviceOperationContext) {
  if (context) return readMappings(await portHost(connectKey,['fport','ls'],context),connectKey,false)
  const target = await client.getTarget(connectKey)
  const forwards = await target.listForwards()
  return map(forwards, (forward) => {
    return {
      local: forward.local,
      remote: forward.remote,
    }
  })
}

export const forward = async function (connectKey: string, local: string, remote: string, context?: DeviceOperationContext) {
  if (context) {
    const output = await portHost(connectKey,['fport',local,remote],context)
    if (!/\bOK\b/i.test(output)) throw new Error('Port operation success was not confirmed')
    return
  }
  const target = await client.getTarget(connectKey)
  await target.forward(local, remote)
}

export const removeForward = async function (
  connectKey: string,
  local: string,
  remote: string,
  context?: DeviceOperationContext
) {
  if (context) {
    const output = await portHost(connectKey,['fport','rm',local,remote],context)
    if (!/\bsuccess\b/i.test(output)) throw new Error('Port operation success was not confirmed')
    return
  }
  const target = await client.getTarget(connectKey)
  await target.removeForward(local, remote)
}

export const listReverses = async function (connectKey: string, context?: DeviceOperationContext) {
  if (context) return readMappings(await portHost(connectKey,['fport','ls'],context),connectKey,true)
  const target = await client.getTarget(connectKey)
  const reverses = await target.listReverses()
  return map(reverses, (reverse) => {
    return {
      local: reverse.local,
      remote: reverse.remote,
    }
  })
}

export const reverse = async function (connectKey: string, remote: string, local: string, context?: DeviceOperationContext) {
  if (context) {
    const output = await portHost(connectKey,['rport',remote,local],context)
    if (!/\bOK\b/i.test(output)) throw new Error('Port operation success was not confirmed')
    return
  }
  const target = await client.getTarget(connectKey)
  await target.reverse(remote, local)
}

export const removeReverse = async function (
  connectKey: string,
  remote: string,
  local: string,
  context?: DeviceOperationContext
) {
  if (context) {
    const output = await portHost(connectKey,['fport','rm',remote,local],context)
    if (!/\bsuccess\b/i.test(output)) throw new Error('Port operation success was not confirmed')
    return
  }
  const target = await client.getTarget(connectKey)
  await target.removeReverse(remote, local)
}

function portHost(key: string,args: string[],context: DeviceOperationContext) {
  if (context.deviceKey !== key || !context.host) throw new Error('Device context mismatch')
  return context.host(args)
}
function readMappings(output: string,key: string,reverse: boolean) {
  if (output.trim() === '[Empty]') return []
  const mappings: {local:string;remote:string}[]=[]
  for (const line of output.split('\n').filter(line=>line.trim())) {
    const parts=line.trim().split(/\s+/)
    if (parts.length!==4 || !/^\[(Forward|Reverse)\]$/.test(parts[3])) throw new Error('Invalid port listing')
    if (parts[0]!==key || parts[3] !== (reverse?'[Reverse]':'[Forward]')) continue
    mappings.push({local:parts[reverse?2:1],remote:parts[reverse?1:2]})
  }
  return mappings
}

export function init(c: Client) {
  client = c

  handleEvent('listForwards', listForwards)
  handleEvent('listReverses', listReverses)
  handleEvent('forward', forward)
  handleEvent('reverse', reverse)
  handleEvent('removeForward', removeForward)
  handleEvent('removeReverse', removeReverse)
}
