import { createReadStream } from 'node:fs'
import { readText, writeScreenshot, writeArtifact } from './files'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { AutomationFault, exitCode, failure, operations, parseRequest, publicSchema, success } from '../common/automation/protocol'
import type { AutomationResult } from '../common/automation/protocol'
import { callAutomation, resolveClientId } from './client'
import { formatResult } from './output'
import { startService } from './start'

export interface CliIo { stdin?: AsyncIterable<Uint8Array | string>; stdout(text: string): void; stderr(text: string): void; signal: AbortSignal }
function defaultProfile() {
  if (process.env.SCRCPY_PLUS_PROFILE) return process.env.SCRCPY_PLUS_PROFILE
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support', 'Scrcpy Plus')
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'Scrcpy Plus')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'Scrcpy Plus')
}
function help() {
  return `Scrcpy Plus automation (protocol v1)\n\nCommands:\n  service start --app <absolute-executable> [--app-arg <argument>]\n  ${Object.keys(operations).map(name => name.replace('.', ' ')).join('\n  ')}\n\nOptions: --json --profile <absolute-path> --client <name> --timeout-ms <1..600000>\nDevice capabilities requires --device <key>. service start defaults to 60000 ms.\nOther commands require a running app; --help and schema work offline.\n`
}
function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {}, appArgs: string[] = [], words: string[] = []
  const booleans = new Set(['json','help','overwrite','text-stdin','command-stdin', ...Object.values(operations).flatMap(op => Object.entries(op.parameters).filter(([,rule]) => rule.type === 'boolean').map(([key]) => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())))])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { words.push(arg); continue }
    const key = arg.slice(2)
    if (Object.hasOwn(flags, key) && key !== 'app-arg') throw new AutomationFault('INVALID_ARGUMENT', `Duplicate option: --${key}`)
    if (booleans.has(key)) flags[key] = true
    else {
      const value = argv[++i]
      if (value === undefined || (key !== 'app-arg' && value.startsWith('--'))) throw new AutomationFault('INVALID_ARGUMENT', `Missing value: --${key}`)
      if (key === 'app-arg') appArgs.push(value); else flags[key] = value
    }
  }
  if (flags.help && words.length === 0) {
    if (Object.keys(flags).some(key => !booleans.has(key)) || appArgs.length) throw new AutomationFault('INVALID_ARGUMENT', 'Unknown help option')
    return { help: true as const }
  }
  const operation = words.join('.')
  if (operation !== 'service.start' && !Object.hasOwn(operations, operation)) throw new AutomationFault('INVALID_ARGUMENT', 'Unknown command; use --help')
  const schema = operations[operation]
  const allowed = new Set(['json','help','profile','client','timeout-ms', ...Object.keys(schema?.parameters || {}).map(key => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()))])
  if (operation === 'service.start') { allowed.add('app'); allowed.add('app-arg') }
  if (['screen.capture','logs.capture','layout.dump'].includes(operation)) { allowed.add('output'); allowed.add('overwrite') }
  if (operation === 'input.text') { allowed.add('text-file'); allowed.add('text-stdin') }
  if (operation === 'shell.run') { allowed.add('command-file'); allowed.add('command-stdin') }
  if (appArgs.length && operation !== 'service.start') throw new AutomationFault('INVALID_ARGUMENT', '--app-arg requires service start')
  for (const key of Object.keys(flags)) if (!allowed.has(key)) throw new AutomationFault('INVALID_ARGUMENT', `Unknown option: --${key}`)
  const params: Record<string, unknown> = {}
  for (const [key, rule] of Object.entries(schema?.parameters || {})) {
    const value = flags[key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())]
    if (value !== undefined) params[key] = rule.type === 'integer' || rule.type === 'number' ? Number(value) : rule.type === 'boolean' ? value === true : value
  }
  if (!flags.help && ['screen.capture','logs.capture','layout.dump'].includes(operation) && (typeof flags.output !== 'string' || !flags.output)) throw new AutomationFault('INVALID_ARGUMENT', 'This command requires --output <path>')
  if (!flags.help && operation === 'input.text' && ['text','text-file','text-stdin'].filter(key => flags[key] !== undefined).length !== 1) throw new AutomationFault('INVALID_ARGUMENT', 'Choose exactly one of --text, --text-file or --text-stdin')
  if (!flags.help && operation === 'shell.run' && ['command','command-file','command-stdin'].filter(key => flags[key] !== undefined).length !== 1) throw new AutomationFault('INVALID_ARGUMENT', 'Choose exactly one of --command, --command-file or --command-stdin')
  const timeoutMs = flags['timeout-ms'] === undefined ? operation === 'service.start' ? 60000 : schema?.timeoutMs ?? 30000 : Number(flags['timeout-ms'])
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) throw new AutomationFault('INVALID_ARGUMENT', 'Invalid timeout-ms')
  const profilePath = flags.profile === undefined ? defaultProfile() : String(flags.profile)
  if (!path.isAbsolute(profilePath)) throw new AutomationFault('INVALID_ARGUMENT', 'Profile path must be absolute')
  return { help: Boolean(flags.help), operation, params, timeoutMs, profilePath, client: String(flags.client ?? 'default'), app: typeof flags.app === 'string' ? flags.app : undefined, appArgs, output: flags.output as string | undefined, overwrite: flags.overwrite === true, textFile: flags[operation === 'shell.run' ? 'command-file' : 'text-file'] as string | undefined, textStdin: flags[operation === 'shell.run' ? 'command-stdin' : 'text-stdin'] === true }
}
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const json = argv.includes('--json'), requestId = randomUUID()
  let result: AutomationResult
  try {
    const args = parseArgs(argv)
    if (args.help) { io.stdout(help()); return 0 }
    const deadline = Date.now() + args.timeoutMs!
    if (['input.text','shell.run'].includes(args.operation!) && (args.textFile !== undefined || args.textStdin)) {
      const stream = args.textFile === undefined ? io.stdin : createReadStream(args.textFile)
      if (!stream) throw new AutomationFault('INVALID_ARGUMENT', 'stdin is unavailable')
      try { args.params![args.operation === 'shell.run' ? 'command' : 'text'] = await readText(stream, { deadline, signal: io.signal }) }
      finally { if ('destroy' in stream && typeof stream.destroy === 'function') stream.destroy() }
    }
    const request = args.operation === 'service.start' ? undefined : parseRequest({ apiVersion: 1, requestId, clientId: 'offline', operation: args.operation, params: args.params, timeoutMs: args.timeoutMs })
    if (args.operation === 'schema') result = success(requestId, publicSchema())
    else {
      const clientId = await resolveClientId(args.profilePath!, args.client!)
      const options = { profilePath: args.profilePath!, deadline, signal: io.signal }
      result = args.operation === 'service.start' ? await startService(args.app, args.appArgs!, clientId, options) : await callAutomation({ ...request!, clientId }, options)
    }
    if (['logs.capture','layout.dump'].includes(args.operation!) && result.ok) result = success(requestId, await writeArtifact(result.data, args.output!, args.overwrite!))
    if (args.operation === 'screen.capture' && result.ok) result = success(requestId, await writeScreenshot(result.data, args.output!, args.overwrite!))
  } catch (error) { result = failure(requestId, error) }
  const text = formatResult(result, json)
  if (!result.ok && !json) io.stderr(text); else io.stdout(text)
  return exitCode(result)
}
if (require.main === module) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel)
  void runCli(process.argv.slice(2), { stdin: process.stdin, stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text), signal: controller.signal })
    .then(code => { process.exitCode = code })
    .finally(() => { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel) })
}
