## Scrcpy Plus 1.0.5-dev.3

这是开发预发布（Pre-release）。稳定 Latest 保持 **Scrcpy Harmony 1.0.4**。

### 本版更新

- **Mac 正式分发**：Apple Silicon arm64 安装包完成 Developer ID 签名、应用与 DMG 公证、票据装订和 Gatekeeper 校验。
- **iPhone 准备流程**：集成 Apple ID 登录、WDA 准备与续签，修复账号互斥、取消、WDA 缓存及资源所有权问题。
- **投屏与界面**：改善 iOS 重连及加载状态，采用 Plus 自适应应用图标，统一公共弹窗和底部操作。
- **更新源迁移**：使用 `MonsterXia/scrcpy-plus`；当前提供 Windows x64 和 Mac arm64，不再提供 Intel Mac 包。

### 下载与升级

- [Windows x64 安装包](https://github.com/MonsterXia/scrcpy-plus/releases/download/v1.0.5-dev.3/Scrcpy-Plus-1.0.5-dev.3-win-x64.exe)
- [Mac Apple Silicon 安装包](https://github.com/MonsterXia/scrcpy-plus/releases/download/v1.0.5-dev.3/Scrcpy-Plus-1.0.5-dev.3-mac-arm64.dmg)
- 可选附件 `scrcpy-plus-cli-1.0.5-dev.3.tgz` 包含 CLI/MCP 客户端，需要 Node >=22.12 及运行中的桌面应用。

已有 Plus 用户手动安装本版，沿用原 Plus 配置。Harmony 与 Plus 的安装/配置身份不同，不自动迁移 Harmony 设置。更新器只打开发行页，不自动安装；开启 Beta Update 才检查开发版。如果旧版检查更新失败，可直接从本页下载升级。

Windows 安装包仍未进行 Authenticode 签名。Mac 包的正式签名、公证、最终更新元数据与安装启动均通过本版 Release Build 验收；下载后可用 `SHA256SUMS.txt` 校验。

iOS 仍为实验性：最新后台启动修复后的连续视频、干净主机/DDI、真实经过七天的续签、Windows 真机及长期连接尚未全部验收。构建和安装启动成功不等于这些设备场景全部通过；较旧 macOS 版本也未逐一实机验证。

### English summary

This development prerelease adds notarized Developer ID distribution for Mac arm64, in-app iPhone preparation/WDA renewal, iOS reconnect fixes, adaptive Plus icons and shared dialogs. Windows x64 packages remain unsigned; Intel Macs are no longer supported. iOS remains experimental, with clean-host, long-duration, real seven-day renewal and Windows device coverage still pending. Existing Plus settings are preserved; Harmony settings are not automatically migrated. Updates open the release page for manual installation.

### Build provenance / 构建来源

- Source: `{{SOURCE}}`
- [Release Build and installation verification]({{RUN_URL}})
- [Preparation PR #102](https://github.com/MonsterXia/scrcpy-plus/pull/102)
- Attachments include matching update YAML/blockmaps, platform verification reports, DMG notarization result, `release-validation.json` and `SHA256SUMS.txt`.
