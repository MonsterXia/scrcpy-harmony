// These HDC/ordering fixtures exercise the production picker element tree and
// handlers. Full React mounting, focus and single-flight coverage lives in
// workspace-navigation.test.cjs; only hooks are inert at this module boundary.
module.exports = function targetPicker(load, store, notifications) {
  const Component = load('src/renderer/main/components/workspace/DeviceSwitcher.tsx', {
    react: { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect() {} },
    'mobx-react-lite': { observer: component => component },
    '../../store': { __esModule: true, default: store },
    './Workspace.module.scss': {},
    'common/util': { t: key => key },
    'share/renderer/lib/util': { notify: (...args) => notifications.push(args) },
  }).default
  const children = Component().props.children[1].props.children
  const select = children.find(child => child?.type === 'select').props
  const options = Object.fromEntries([select.children].flat(Infinity).filter(Boolean)
    .map(option => [option.props.children, option.props.value]))
  return { notifications, select: { ...select, options },
    refresh: children.find(child => child?.props?.['data-action'] === 'refresh-devices').props.onClick }
}
