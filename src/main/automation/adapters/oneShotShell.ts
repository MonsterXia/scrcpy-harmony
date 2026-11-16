import { randomUUID } from 'node:crypto'
import { AutomationFault, checkContext } from '../../../common/automation/protocol'
import type { AutomationContext } from '../../../common/automation/protocol'
export async function runOneShotShell(command: string,maxBytes: number,context: AutomationContext,transport: (command: string)=>Promise<string>) {
  checkContext(context)
  if (typeof command !== 'string' || !command.trim() || command.includes('\0') || command.length>65536 || !Number.isInteger(maxBytes) || maxBytes<1 || maxBytes>131072) throw new AutomationFault('INVALID_ARGUMENT','Invalid shell command or output limit')
  const marker=`SCRCPY_SHELL_${randomUUID()}:`
  // User command intentionally runs in a device shell; quoting preserves the
  // script as one sh -c argument, and a separate parent collects its exit code.
  const quoted=command.replace(/'/g,"'\"'\"'")
  const output=await transport(`sh -c '${quoted}'; printf '\\n${marker}%s\\n' "$?"`)
  checkContext(context)
  const match=output.match(new RegExp(`\\n${marker}([0-9]+)\\r?\\n?$`))
  if (!match) throw new AutomationFault('OUTCOME_UNKNOWN','Shell completion was not confirmed','unknown')
  const bytes=Buffer.from(output.slice(0,match.index),'utf8')
  const limited=bytes.subarray(0,maxBytes)
  // A byte cap can split the last UTF-8 character. Stream decode omits an
  // incomplete trailing sequence instead of expanding it into a replacement.
  const decoder=new TextDecoder('utf-8')
  return { output:decoder.decode(limited,{stream:bytes.length>maxBytes}),exitCode:Number(match[1]),truncated:bytes.length>maxBytes }
}
