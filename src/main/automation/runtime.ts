import { createHarmonyToolHandlers } from './adapters/harmonyTools'
import { automationShell, getOverview } from '../lib/hdc'
import { getProcesses } from '../lib/hdc/base'
import { getBundles, getBundleInfos, getTopBundle } from '../lib/hdc/bundle'
import { registerSessionOperations } from './sessionOperations'
import { ipcMain } from 'electron'
import { AutomationController } from './controller'
import { AutomationFault, checkContext } from '../../common/automation/protocol'
import type { AutomationContext } from '../../common/automation/protocol'
import type { InputAction } from './input'
import { executeInput } from './input'
import { createAutomationService } from './service'
import { nativeMirrors } from '../window/nativeMirror'
import * as screencast from '../window/screencast'
import { getDevices } from '../lib/devices'
import { withTrustedCaptureInput, setCaptureInputGate } from '../lib/hdc/captureSessions'
import { captureInputEndpoint } from '../lib/hdc/uitest'
import { sendScreencastInput, sendScreencastSystemKey } from '../lib/hdc/screencastInput'
import { androidInput } from './adapters/android'
import { harmonyInput } from './adapters/harmony'
const systemKeys: Record<string, number> = { home: 1, back: 2, power: 18, 'volume-up': 16, 'volume-down': 17 }
const typingKeys: Record<string, number> = { enter: 2054, backspace: 2055, tab: 2049, up: 2012, down: 2013, left: 2014, right: 2015 }
export function createAutomationRuntime(instanceId: string, version: string) {
  const controller = new AutomationController({ instanceId, ipc: ipcMain, discover: getDevices,
    open: async (target,gui) => target.platform === 'harmony' ? screencast.showWin(target,gui) : nativeMirrors.start(target,gui),
    perform: async (source,action,geometry,context) => {
      if (source.target.platform === 'android') return executeInput(action,geometry,androidInput(nativeMirrors.inputBackend(source.target.key)),context)
      if (source.target.platform !== 'harmony') throw new AutomationFault('UNSUPPORTED', 'Input is not supported on this platform')
      return withTrustedCaptureInput(source.window.webContents,source.target.key,async (key,signal,lease) => {
        const current: AutomationContext = { ...context, signal: AbortSignal.any([context.signal,signal]) }
        checkContext(current)
        const size = await lease.driver.getDisplaySize()
        const endpoint = captureInputEndpoint()
        const backend = harmonyInput(lease,size,{
          text: (text,signal) => sendScreencastInput(key,{type:'text',text},endpoint,signal),
          key: (name,signal) => systemKeys[name] ? sendScreencastSystemKey(key,systemKeys[name],endpoint,signal) : sendScreencastInput(key,{type:'keys',keys:[typingKeys[name]]},endpoint,signal),
        })
        // Harmony wheel deltas are emulated by a 250 ms finger swipe, clamped
        // within the selected screenshot. Positive deltas move the finger right/down.
        const translated: InputAction = action.type === 'scroll' && geometry ? {
          type:'swipe',x:action.x,y:action.y,
          toX:Math.max(0,Math.min(geometry.width-1,action.x+action.dx*geometry.width/2)),
          toY:Math.max(0,Math.min(geometry.height-1,action.y+action.dy*geometry.height/2)),durationMs:250,
        } : action
        await executeInput(translated,geometry,backend,current)
      })
    },
  })
  nativeMirrors.setAutomationHooks(controller.attach)
  screencast.setAutomationHooks(controller.attach)
  setCaptureInputGate((key,phase,operation) => controller.queue.gui(key,phase,operation))
  const service = createAutomationService({ instanceId,version,discover:getDevices,
    running: key => controller.sessions.list().some(session => session.deviceKey === key && session.state === 'running') })
  registerSessionOperations(service, controller)
  const tools = createHarmonyToolHandlers({ discover: getDevices, shell: automationShell, overview: getOverview, appsList: getBundles, appsInfo: getBundleInfos, appsTop: getTopBundle, processes: getProcesses })
  for (const [name, handler] of Object.entries(tools)) service.register(name, handler)
  return { ...service, controller }
}
