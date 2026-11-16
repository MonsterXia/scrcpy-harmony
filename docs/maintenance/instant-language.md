# 即时语言切换（2026-11-16）

来源：用户要求“为什么切换语言需要重启？，请做即时切换”。初轮修改源码并构建验证；随后用户授权“更新本机安装版本，我试一下即时切换语言”，已按下方安装记录更新本机。未发布版本。

## 原因和实现

原流程仅在启动时读取语言；设置只保存选择，界面依赖重启重新加载。部分表头在模块顶层计算译文，Luna DataGrid 的 columns 更新也不接受 title，单独更新词典不足以切换全部界面。

现在 SettingsStore 先原子保存再发布变更，失败不改变内存配置或界面。主进程更新当前语言和菜单，广播 `updateLanguage(resolvedLocale)`。统一渲染入口先订阅再读取语言，忽略过期启动回包，同步文档语言和 Luna 确认框语言。`t()` 参与 MobX 依赖跟踪，翻译组件使用 observer，表头使用 computed，Luna 原位更新列标题。窗口标题随语言变化，Android 的设备名称标题保持原名称。

语言选择不刷新窗口、不重建 React 根或设备会话；语言提示改为即时生效。HDC 路径修改仍需重启。设置反馈保存词条标识而非固定译文，切换后显示当前语言。

## 验证

- 国际化和 ESLint 通过；主进程、preload、renderer 三项生产构建通过。
- 回归先复现了语言未广播、翻译消费者未更新、保存通知早于落盘、表格标题未更新，再验证修复；覆盖启动 IPC 竞态、系统语言归一、存盘失败及表格行/选中项保持。
- 最终 `npm test` 退出 0：应用 1110 pass / 2 skip / 0 fail；Licia 生产及 fallback 两模式各 606 passing / 4 pending。
- TypeScript 与当前 HEAD 的原始文件在同一依赖环境对比：两者均 57 项诊断，无新增或消除；不能称完整类型检查通过。见 [对比](../scrcpy-plus/evidence/instant-language-2026-11-16/type-comparison.json)。
- macOS / Electron 45.0.0，真实主进程、preload、React、设置落盘；模拟设备/投屏 IPC。中英文各启动一次，再分别切换到另一语言、原语言和 system，共 6 次在线切换。验证设置页、原生菜单、已打开的进程管理器标题及表头同步；进程 PID、DOM 输入节点、未保存路径、网格实例和三端模拟会话保持不变。见 [UI 报告](../scrcpy-plus/evidence/instant-language-2026-11-16/ui.json)。
- 已查看 [中文](../scrcpy-plus/evidence/instant-language-2026-11-16/zh-CN.png) 与 [英文](../scrcpy-plus/evidence/instant-language-2026-11-16/en-US.png) 截图，语言行和选项无溢出，导航文字同步。

## 边界与下一步

本轮未进行真实手机投屏期间的语言切换或 Windows/Intel Mac 验证。现有模拟会话保持不等于真机视频连续性验证。下一步在这些平台及实际投屏期间补验；本次不借用历史真机证据标为完成。

## 本机安装（用户追加授权）

2026-11-16 已完整 build 并生成 arm64 DMG（`--no-publish --adhoc-sign`），核对 38 个应用构建文件与 app.asar 内容一致、包 ID、版本、架构及 deep/strict 签名通过。替换 `/Applications/Scrcpy Plus.app`，版本继续为 `1.0.5-dev.1`。旧应用和 57 份配置文件已备份并核验，备份及构建日志保留在忽略目录 `release/instant-language-local-install/20261116-161301/`。

已安装应用的独立配置 smoke 检查通过；随后启动日常配置中的实际安装，原语言/主题等 settings 保持一致，原生 UI 确认设置页显示“语言切换即时应用于所有已打开的窗口”。应用保持运行在设置页，供用户手工试用。此次未启动真机投屏，不把打开设置页当成视频连续性验收。摘要见 [安装记录](../scrcpy-plus/evidence/instant-language-2026-11-16/local-install.json)。
