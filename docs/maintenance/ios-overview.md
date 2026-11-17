# USB iPhone 概览（2026-11-16）

用户将下一步优先级调整为“先实现在概览中选择 iPhone 并读取相应信息”。此任务完成；WDA 签名、Developer Mode、真机截图和点击仍为独立待办。

## 实现与边界

概览选择器和 `overviewTarget` 新增 USB iOS，排除 AirPlay receiver。持久化、启动恢复、设备刷新保留选项；选择 iOS 时回到概览并禁用鸿蒙专用导航，不改变 HDC target。

`getDeviceOverview` 根据当前发现的 USB UDID 分派到 `ios-usbmux.getIosOverview`，重新解析 DeviceID，连接设备端 62078，发送公开 lockdown `GetValue`。复用有界分帧/超时与 socket 清理，只读、无签名、无 WDA/开发者模式要求；错误/非元数据响应拒绝，不伪造信息。

返回设备名称、ProductType 型号标识、系统版本、构建版本、CPU 架构、硬件型号、型号号码、序列号、设备类别和选定 UDID。可选值没返回则显示“未知”。不把型号标识猜成商品名，不编造内存/分辨率；界面换为 iOS 有意义的构建/硬件字段。提示和空态同步中英文。

## 验证

汇总见 [verification.json](../scrcpy-plus/evidence/ios-overview-2026-11-16/verification.json)。

- 回环 TCP 模拟 usbmux/lockdown：目标 UDID 与端口、分帧、公有元数据、拒绝错误/非法响应与接收器，测试通过。
- Store/React：iPhone 可选、AirPlay 排除、启动恢复/轮询保留、HDC target 隔离、鸿蒙工具禁用、切换清除旧信息，测试通过。
- 全量应用：1152 pass / 2 skip / 0 fail；lint/i18n、main/preload/renderer 构建通过。
- TypeScript：55 项既有诊断，与先前基线相同，未声称整体类型检查全绿。
- 真实 Electron 模拟 IPC：中英文、深浅主题，iOS 概览显示及 Android/Harmony 回归通过；截图和结果见 [证据目录](../scrcpy-plus/evidence/ios-overview-2026-11-16/ui.json)。
- **真实 USB iPhone + 正式 Electron IPC**：独立临时配置启动当前源码构建；在真实选择器选中 iPhone，读到 iOS 27.2.1、构建 24B156、ProductType iPhone18,1、HardwareModel V53AP、arm64e；UDID 与所选 USB 设备一致，鸿蒙导航禁用。未 mock 信息读取。该设备未返回序列号和型号号码，实际界面显示未知。设备私有名称/UDID 不写入公开证据。

此 worktree 初次临时复用另一检出的 node_modules，导致“依赖必须解析到本地维护源码”测试失败；已替换为 worktree 内独立目录，relative vendor 链接归属正确，相关测试及全量重跑通过。资源复用已有只读构建产物，未改安装应用或手机配置。

下一步：用户就绪后配置 Xcode 签名及手机开发者模式，再分别验收 WDA 截图和点击。此次未替换 `/Applications` 安装版，未启动 ReplayKit 广播。

## 用户授权更新安装版

随后按用户要求完成完整 `npm run build`、`npm run pack -- --no-publish --adhoc-sign`，验证 macOS arm64 包签名（deep/strict）及 38 个代码文件与 dist 一致。备份旧应用和完整用户配置，核对 6 个 data 文件后替换 `/Applications/Scrcpy Plus.app`；安装后独立配置 smoke 通过，日常 settings 保持不变。备份位于本机用户目录 `Library/Application Support/Scrcpy Plus Backups/20261116-183202-ios-overview`，未发布。

已启动真正的安装版，通过原生界面选择当前 USB iPhone，观察到 iOS 27.2.1、24B156、iPhone18,1、arm64e 和 V53AP；窗口保留在 iPhone 概览供用户查看。序列号/型号号码仍为未知，未更改开发者模式或运行 WDA。安装结果见 [local-install.json](../scrcpy-plus/evidence/ios-overview-2026-11-16/local-install.json)。
