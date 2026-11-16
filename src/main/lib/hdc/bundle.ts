import type { DeviceOperationContext } from '../../../common/automation/deviceContext'
import {
  IBundleInfo,
} from 'common/types'
import { Client } from 'hdckit'
import { handleEvent } from 'share/main/lib/util'
import { shell } from './base'
import trim from 'licia/trim'
import { getOnlineBundleInfo } from './onlineBundleInfo'
import log from 'share/common/log'
import map from 'licia/map'
import startWith from 'licia/startWith'
import filter from 'licia/filter'
import contain from 'licia/contain'
import { sendAll } from 'share/main/lib/window'

const logger = log('hdcBundle')

let client: Client

export const getBundles = async (connectKey: string, system = true, context?: DeviceOperationContext) => {
  const result = await shell(connectKey, 'bm dump -a', context)
  const bundles = map(trim(result).split('\n').slice(1), (line) => trim(line))

  return system ? bundles : filter(bundles, (bundle) => !isSystemBundle(bundle))
}

function isSystemBundle(bundle: string) {
  const sysBundlePrefixs = [
    'com.huawei.hmos',
    'com.huawei.hms',
    'com.huawei.msdp',
    'com.ohos',
  ]
  for (let i = 0, len = sysBundlePrefixs.length; i < len; i++) {
    if (startWith(bundle, sysBundlePrefixs[i])) {
      return true
    }
  }

  if (
    contain(
      [
        'ohos.global.systemres',
        'com.huawei.associateassistant',
        'com.huawei.batterycare',
        'com.huawei.shell_assistant',
        'com.usb.right',
      ],
      bundle
    )
  ) {
    return true
  }

  return false
}

export const getBundleInfos = async (connectKey: string, bundleNames: string[], context?: DeviceOperationContext) => {
  const result: IBundleInfo[] = []
  // Probe the connected device, not the app's target API. Keep this scoped to
  // one request so reconnects and system updates cannot leave stale support.
  let supportsLabel: boolean | undefined

  for (const bundleName of bundleNames) {
    try {
      // Keep transport, parsing and metadata tied to this bundle. The shared
      // batch shell framing cannot isolate transport failures or delimiter text.
      const dump = (await shell(connectKey, `bm dump -n ${bundleName}`, context)).trim()
      let json = dump
      if (!dump.startsWith('{')) {
        const newline = dump.indexOf('\n')
        if (newline === -1 || dump.slice(0, newline).trim() !== `${bundleName}:`) {
          throw new Error(
            `Unexpected bm dump header or command error: ${dump.slice(0, 160)}`
          )
        }
        json = dump.slice(newline + 1)
      }
      const info = JSON.parse(json)
      const applicationInfo = info?.applicationInfo
      if (
        !applicationInfo ||
        typeof applicationInfo !== 'object' ||
        Array.isArray(applicationInfo)
      ) {
        throw new Error('Missing or invalid applicationInfo')
      }
      if (
        (info.name !== undefined && info.name !== bundleName) ||
        (applicationInfo.bundleName !== undefined &&
          applicationInfo.bundleName !== bundleName)
      ) {
        throw new Error('bm dump bundle name does not match the requested bundle')
      }

      const bundleInfo: IBundleInfo = {
        bundleName,
        label: bundleName,
        icon: '',
        system: applicationInfo.isSystemApp === true,
        versionName:
          typeof applicationInfo.versionName === 'string'
            ? applicationInfo.versionName
            : '',
        apiTargetVersion:
          typeof applicationInfo.apiTargetVersion === 'number'
            ? applicationInfo.apiTargetVersion
            : 0,
        vendor:
          typeof applicationInfo.vendor === 'string' ? applicationInfo.vendor : '',
        installTime: typeof info.installTime === 'number' ? info.installTime : 0,
        releaseType: typeof info.releaseType === 'string' ? info.releaseType : '',
      }

      if (info.mainEntry) {
        const index = Array.isArray(info.hapModuleNames)
          ? info.hapModuleNames.indexOf(info.mainEntry)
          : -1
        const mainModuleInfo = Array.isArray(info.hapModuleInfos)
          ? info.hapModuleInfos[index]
          : undefined
        const ability =
          mainModuleInfo?.mainAbility || mainModuleInfo?.abilityInfos?.[0]?.name
        if (typeof ability === 'string' && ability) {
          bundleInfo.mainAbility = ability
        } else {
          logger.warn('Missing main ability for bundle', connectKey, bundleName)
        }
      }

      let localLabel = displayableLabel(applicationInfo.label)
      if (localLabel) {
        bundleInfo.label = localLabel
      } else {
        if (supportsLabel === undefined) {
          supportsLabel = false
          try {
            const help = await shell(connectKey, 'bm dump -h', context)
            supportsLabel = /^\s*-l,\s*--label\b/m.test(help)
          } catch (error) {
            logger.warn('Failed to check bundle label support', connectKey, error)
          }
        }
        if (supportsLabel) {
          try {
            const label = displayableLabel(
              await shell(connectKey, `bm dump -n ${bundleName} -l`, context)
            )
            if (!label) {
              throw new Error('Empty, unresolved or invalid bundle label response')
            }
            bundleInfo.label = label
            localLabel = label
          } catch (error) {
            logger.warn('Failed to read bundle label', connectKey, bundleName, error)
          }
        }
      }

      if (!context && !bundleInfo.system && !startWith(bundleName, 'com.huawei')) {
        try {
          const onlineInfo = await getOnlineBundleInfo(bundleName)
          if (!localLabel && onlineInfo.name) {
            bundleInfo.label = onlineInfo.name
          }
          if (onlineInfo.icon) {
            bundleInfo.icon = onlineInfo.icon
          }
        } catch (error) {
          logger.warn(
            'Online bundle info unavailable; using device metadata',
            bundleName,
            (error as Error).message
          )
        }
      }
      result.push(bundleInfo)
    } catch (error) {
      logger.warn('Failed to read bundle info', connectKey, bundleName, error)
    }
  }

  return result
}

function displayableLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  const label = value.trim()
  if (
    !label ||
    label.startsWith('$') ||
    Array.from(label).some((char) => char.charCodeAt(0) < 32) ||
    /^(error|usage)\s*:/i.test(label)
  ) {
    return ''
  }
  return label
}

async function writeBundleShell(key: string, command: string, context?: DeviceOperationContext) {
  if (!context) { await shell(key,command); return }
  const output = await shell(key,`${command}; printf '\\nSCRCPY_APP_EXIT:%s\\n' "$?"`,context)
  if (!/\nSCRCPY_APP_EXIT:0\r?\n?$/.test(output) || /^\s*(?:\[Fail\]|\[E\d{6}\]|error:|failed)/im.test(output)) throw new Error('Application operation success was not confirmed')
}

export const installBundle = async (connectKey: string, hap: string, context?: DeviceOperationContext) => {
  if (context) {
    if (context.deviceKey !== connectKey || !context.host) throw new Error('Device context mismatch')
    const output = await context.host(['install','-r',hap])
    if (!output.includes('install bundle successfully')) throw new Error('Installation success was not confirmed')
  } else {
    const target = await client.getTarget(connectKey)
    await target.install(hap)
  }
  try {
    sendAll('bundleInstalled', connectKey)
  } catch (error) {
    // A closing window must not turn a completed installation into a failure.
    logger.warn('Failed to notify windows after installation', error)
  }
}

export const startBundle = async (connectKey: string, bundleName: string, ability: string, context?: DeviceOperationContext) => {
  await writeBundleShell(connectKey, `aa start -a ${ability} -b ${bundleName}`, context)
}

export const stopBundle = async (connectKey: string, bundleName: string, context?: DeviceOperationContext) => {
  await writeBundleShell(connectKey, `aa force-stop ${bundleName}`, context)
}

export const cleanBundleData = async (connectKey: string, bundleName: string, context?: DeviceOperationContext) => {
  await writeBundleShell(connectKey, `bm clean -n ${bundleName} -d`, context)
}

export const cleanBundleCache = async (
  connectKey: string,
  bundleName: string,
  context?: DeviceOperationContext
) => {
  await writeBundleShell(connectKey, `bm clean -n ${bundleName} -c`, context)
}

export const uninstallBundle = async (connectKey: string, bundleName: string, context?: DeviceOperationContext) => {
  if (context) {
    if (context.deviceKey !== connectKey || !context.host) throw new Error('Device context mismatch')
    const output = await context.host(['uninstall',bundleName])
    if (!output.includes('uninstall bundle successfully')) throw new Error('Uninstall success was not confirmed')
  } else {
    const target = await client.getTarget(connectKey)
    await target.uninstall(bundleName)
  }
}

export const getTopBundle = async (connectKey: string, context?: DeviceOperationContext) => {
  const abilityInfo = await shell(connectKey, 'aa dump -a', context)
  const lines = map(abilityInfo.split('\n'), (line) => trim(line))

  let name = ''
  let pid = 0
  let state = ''
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = lines[i]
    if (startWith(line, 'process name')) {
      name = line.slice('process name ['.length, -1)
    } else if (startWith(line, 'pid')) {
      const pidMatch = line.match(/pid #(\d+)/)
      if (pidMatch) {
        pid = parseInt(pidMatch[1], 10)
      }
    } else if (startWith(line, 'state')) {
      if (line === 'state #FOREGROUND' && !isSystemBundle(name)) {
        state = 'foreground'
        break
      }
    }
  }
  if (state !== 'foreground') {
    return {
      name: '',
      pid: 0,
    }
  }

  return {
    name,
    pid,
  }
}

export async function init(c: Client) {
  client = c

  handleEvent('getBundles', getBundles)
  handleEvent('installBundle', installBundle)
  handleEvent('getBundleInfos', getBundleInfos)
  handleEvent('startBundle', startBundle)
  handleEvent('stopBundle', stopBundle)
  handleEvent('cleanBundleData', cleanBundleData)
  handleEvent('cleanBundleCache', cleanBundleCache)
  handleEvent('uninstallBundle', uninstallBundle)
  handleEvent('getTopBundle', getTopBundle)
}
