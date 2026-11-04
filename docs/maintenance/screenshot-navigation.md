# 截图页切换后的短暂残留

2026-11-04，用户提供 GIF：从 Screenshot 切到 Applications 后，手机截图短暂叠在应用列表上。基线 `507a8be`，修复分支 `codex/fix-screenshot-navigation`。

## 原因与修复

工作台的已访问面板保持挂载，以保留会话、截图及视图状态；切页通过父节点 `visibility` 隐藏。Luna ImageViewer 的 `.image-transition` 使用 `transition: all 0.3s`，导致图片继承的 `visibility` 变化也参与过渡。旧代码在真实 Electron 中复现：应用页已经激活，图片到约 305ms 仍为可见，约 313ms 才隐藏，与用户动图一致。

本地维护的 `vendor/packages/luna-image-viewer/src/image-viewer/style.scss` 改为仅对 `width`、`height`、`margin-left`、`margin-top`、`transform` 过渡，对应组件实际修改的缩放、位置和旋转属性。继承的隐藏状态立即生效，不卸载页面、不清空截图，不改变截图 IPC 或投屏设计。

## 验证

`script/check-screenshot-navigation.cjs` 加载构建后的真实 renderer、Panel、Luna 组件和样式；设备数据与设置使用现有隔离 UI fixture。测试不连接手机，不使用日常配置，也不保存手机画面。

```sh
npm run build:renderer
node script/check-screenshot-navigation.cjs release/screenshot-navigation/report.json
```

- 先运行旧代码，首个切页用例因约 300ms 残留失败，再修改源码重新构建。
- 修复后 24 个场景通过：中英文 × 深浅色 × 1180/960 宽度 × Applications/Shell/Settings。在 400ms 窗口内逐动画帧检查，目标页激活后图片均为隐藏；返回后图片 DOM、缩放和旋转几何状态均保留。
- renderer 构建及 lint/i18n 通过。
- 首轮全量应用测试 906/907：`overview uses five finite reads, preserves fields and leaves key input on legacy transport` 发生 `HDC_COMMAND_TIMEOUT during connect`。该 fixture 将预算压缩为 100ms；当时同时运行 Electron 验证。定向重跑 `test/overview-deadline.test.cjs` 34/34 通过，不修改概览源码或放宽测试断言。
- 结束 Electron 验证后完整重跑 `npm test` 通过：应用 907/907，Licia 生产与 fallback 两模式各 606 passing / 4 pending（已有外部夹具待办）。首次失败仍保留，不将单次重跑推断为计时用例已不存在波动。

前后逐帧结果的精简归档及源码哈希见 [验证数据](screenshot-navigation-verification.json)，原始逐帧数据保存在本地忽略目录 `release/screenshot-navigation/`。

## 交付边界与下一步

本轮为源码及 macOS Electron 模拟设备 UI 验证；未发布新版本、未替换 `/Applications` 安装版，Windows/macOS x64 及安装包真机切页尚未验证。下一步按交付流程提交 PR、检查 CI，再纳入后续构建。
