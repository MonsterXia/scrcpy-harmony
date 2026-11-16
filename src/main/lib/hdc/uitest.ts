import type { DeviceOperationContext } from '../../../common/automation/deviceContext'
import { toHierarchyXml } from './layoutXml'
import { Client } from 'hdckit'
import { ipcMain } from 'electron'
import {
  IpcGetDisplaySize,
} from 'common/types'
import { getTargetStore, setTargetStore } from './base'
import { getUserDataPath, handleEvent, resolveResources } from 'share/main/lib/util'
import { CaptureUiDriver } from './captureDriver'
import { gateCaptureInput, initCaptureIpc, prepareCapture, withCaptureInput, withCaptureTouch } from './captureSessions'
import { sendScreencastInput, sendScreencastSystemKey, validateScreencastInput } from './screencastInput'
export { cancelCapturePreparation, shutdownCaptures } from './captureSessions'
import { NativeVideo } from './nativeVideo'
import { ControlRecovery } from './controlRecovery'
import { runFiniteShell } from './finiteShell'

let client: Client

const initializingDrivers = new Map<string, Promise<CaptureUiDriver>>()

function nativeOptions(connectKey: string) {
  return {
    ...client.options, connectKey,
    resourcesDir: resolveResources('native-video'),
    cacheDir: getUserDataPath('data/native-video'),
  }
}

export function prepareTarget(connectKey: string, scale: number, valid: () => boolean) {
  return prepareCapture(connectKey, scale, valid, key => getUiDriver(key, true),
    () => new NativeVideo(nativeOptions(connectKey)).available())
}

async function getUiDriver(connectKey: string, background = false): Promise<CaptureUiDriver> {
  let uiDriver = getTargetStore(connectKey, 'uiDriver')
  if (uiDriver) {
    if (!background) await uiDriver.nativeVideo?.recoverOrphans(true)
    return uiDriver
  }
  const pending = initializingDrivers.get(connectKey)
  if (pending) {
    const driver = await pending
    if (!background) await driver.nativeVideo?.recoverOrphans(true)
    return driver
  }
  const initializing = (async () => {
    const target = await client.getTarget(connectKey)
    uiDriver = new CaptureUiDriver(
      target,
      resolveResources('uitestkit_sdk/uitest_agent_v1.1.0.so'),
      '1.1.0',
    )
    uiDriver.controlRecovery = new ControlRecovery(command => runFiniteShell(connectKey, command, {
      host: client.options.host, port: client.options.port, timeoutMs: 5000,
    }))
    uiDriver.nativeVideo = new NativeVideo(nativeOptions(connectKey))
    await uiDriver.initializeControl(background)
    setTargetStore(connectKey, 'uiDriver', uiDriver)
    return uiDriver
  })()
  initializingDrivers.set(connectKey, initializing)
  try {
    return await initializing
  } finally {
    if (initializingDrivers.get(connectKey) === initializing) {
      initializingDrivers.delete(connectKey)
    }
  }
}

export async function dumpWindowHierarchy(connectKey: string, context?: DeviceOperationContext) {
  if (context && (context.deviceKey !== connectKey || !context.wait)) throw new Error('Device context mismatch')
  const uiDriver = context ? await context.wait!(() => getUiDriver(connectKey)) : await getUiDriver(connectKey)
  const layout = context ? await context.wait!(() => uiDriver.captureLayout()) : await uiDriver.captureLayout()
  return toHierarchyXml(layout)
}

const getDisplaySize: IpcGetDisplaySize = async function (connectKey) {
  const uiDriver = await getUiDriver(connectKey)
  return uiDriver.getDisplaySize()
}

export function captureInputEndpoint() { return { host: client.options.host, port: client.options.port } }
export function inputSystemKey(key: string, code: number) {
  return gateCaptureInput(key, undefined, () => sendScreencastSystemKey(key, code, client.options))
}

export function init(c: Client) {
  client = c

  handleEvent('dumpWindowHierarchy', dumpWindowHierarchy)
  handleEvent('getDisplaySize', getDisplaySize)
  initCaptureIpc(getUiDriver)
  for (const channel of ['touchDown', 'touchMove', 'touchUp'] as const) {
    ipcMain.handle(channel, (event, key, x, y) => {
      if (![x, y].every(value => Number.isInteger(value) && value >= 0 && value <= 16384)) {
        throw new Error('Invalid touch coordinates')
      }
      return withCaptureTouch(event, key, channel, x, y)
    })
  }
  // Input contents must not be recorded by the generic handleEvent logger.
  ipcMain.handle('screencastInput', (event, id, action) => {
    validateScreencastInput(action)
    return withCaptureInput(event, id, (key, signal) => sendScreencastInput(key, action, client.options, signal))
  })
}
