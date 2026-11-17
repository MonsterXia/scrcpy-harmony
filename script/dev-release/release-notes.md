## Scrcpy Plus 1.0.5-dev.2

Scrcpy Plus 的开发预发布，基于 Scrcpy Harmony 扩展 Android、HarmonyOS 和 iOS 投屏工作台。稳定 Latest 保持 v1.0.4。

### 本版内容

- 内置 Android USB/ADB、Harmony 投屏与 iOS AirPlay，统一设备选择、批量启动和窗口排列。
- 即时中英文切换、平台对应的设备概览，以及共享自动化服务、独立 CLI/MCP 客户端。
- USB iPhone 概览无需 WDA 即可读取公开设备信息。
- 实验性 WDA PNG 截图/控制与 ReplayKit 连续视频；Runner 媒体端口限制为回环访问，自有资源清理响应丢失后可确认恢复。

### 安装与兼容性

Windows x64 使用 EXE；macOS Apple Silicon/Intel 分别选择 arm64/x64 DMG。CLI/MCP 可选附件 `scrcpy-plus-cli-1.0.5-dev.2.tgz` 需要 Node >=22.12 和正在运行的 Plus 桌面应用。

Harmony 与 Plus 有独立的安装和配置身份。保留旧 Harmony 应用和配置，Plus 初次启动创建独立配置；不会自动迁移 Harmony 设置。已有 Plus 开发版继续使用 Plus 配置。更新器仅打开下载页供手动安装。

Windows 安装包未做发行者签名；macOS 使用 ad-hoc 签名，通过 deep/strict 校验，无 Developer ID 或公证。系统信任状态见附件中的平台报告。

### 验证与实验边界

最终源提交：a116aa09f46259954493e83a498774500bae8954。

公开前门禁包括五项 CI、同源三平台实际安装启动、补丁后 WDA/ReplayKit 未签名编译、CLI/MCP 安装、三平台默认配置与升级/更新矩阵、15 项附件重新下载校验。SHA256SUMS 与 release-validation 提供固定来源和摘要。

iPhone 概览已通过真机验证；WDA 控制和 ReplayKit 需自行配置 Xcode 签名、信任电脑和开发者模式，签名后的截图/点击/视频、旋转/拔插、多机隔离及长期矩阵尚未完成。界面和协议自动测试不代表这些真机验收通过。运行 WDA 的步骤见仓库 `docs/scrcpy-plus/ios-usb-wda.md`。
