import './automation/profile'
import { app } from 'electron'
import * as menu from './lib/menu'
import * as main from './window/main'
import * as terminal from 'share/main/window/terminal'
import * as hdc from './lib/hdc'
import * as devices from './lib/devices'
import * as updater from './lib/updater'
import * as screencastPreparation from './lib/screencastPreparation'
import log from 'share/common/log'
import 'share/main'
import { randomUUID } from 'node:crypto'
import { getUserDataPath } from 'share/main/lib/util'
import { createAutomationService } from './automation/service'
import { startAutomationServer } from './automation/server'
import { attachAutomationLifecycle } from './automation/lifecycle'

const logger = log('main')
logger.info('start')

app.on('ready', () => {
  logger.info('app ready')

  updater.init()
  terminal.init()
  hdc.init()
  devices.init()
  attachAutomationLifecycle(app, () => {
    const instanceId = randomUUID()
    const service = createAutomationService({ instanceId, version: app.getVersion(), discover: devices.getDevices })
    return startAutomationServer({ profilePath: getUserDataPath(''), instanceId, recoverStaleLock: true, dispatch: service.dispatch })
  }, code => logger.error(code))
  screencastPreparation.init()
  main.showWin()
  menu.init()
})
