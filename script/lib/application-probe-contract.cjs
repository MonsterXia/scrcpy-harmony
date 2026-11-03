const dictionaries = [
  { ...require('../../src/share/common/langs/en-US.json'), ...require('../../src/common/langs/en-US.json') },
  { ...require('../../src/share/common/langs/zh-CN.json'), ...require('../../src/common/langs/zh-CN.json') },
]

const confirmationActions = ['stop', 'cleanCache', 'cleanData', 'uninstall']

// The current workspace exposes a semantic refresh button. The fallback is
// explicitly for the old installed 1.0.4 toolbar, including while disabled.
function applicationToolbarDropSelector(currentWorkspace) {
  return currentWorkspace
    ? '[data-application] button[data-action="refresh"]'
    : '.panel-toolbar'
}

function findConfirmationAction(template, action) {
  if (!confirmationActions.includes(action)) throw Error(`Unknown confirmation action: ${action}`)
  const labels = dictionaries.map(dictionary => dictionary[action])
  const item = template?.find(item => item.type !== 'separator' && labels.includes(item.label))
  if (!item?.click) throw Error(`Missing menu action: ${action}`)
  return item
}

module.exports = { applicationToolbarDropSelector, confirmationActions, findConfirmationAction }
