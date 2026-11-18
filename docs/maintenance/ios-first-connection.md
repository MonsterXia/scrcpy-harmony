# iPhone 首次连接缺口（2026-11-17）

## 用户目标与状态

用户安装已完成 macOS 正式签名、公证的候选包后，删除 iPhone 上的 Mobilerun / WebDriverAgentRunner 模拟新设备；USB 投屏显示“iPhone 尚未就绪”。用户明确希望普通用户只安装桌面包，其余尽量自动完成，不要求安装 Xcode 或手动运行命令。

后续用户先要求完全不登录 Apple ID；了解预签名仍受设备名单限制后，先同意探索登录 Apple ID，随后明确授权验证免费签名、安装和启动，并完成必要的登录、确认及手机信任。独立工具验证已通过，正式接入尚未完成。结果见 [Apple ID 签名可行性](ios-apple-id-signing-research.md)。

**根因已确认，产品内首次部署能力尚未实现。** 后续经用户授权，已从 Runner 缺失状态完成独立工具下的免费签名、安装与 CoreDevice 启动，并恢复现有桌面包的 ReplayKit 投屏和 Home 控制；不能将这次手动辅助验证等同于公开安装包已经自动支持新设备。

## 本轮证据

- 源码基线 `a5175fe`；当前 worktree 含上一任务的 macOS 签名维护文档变更，不修改这些结果的适用范围。
- 当前连接的 iPhone 13 / iOS 26.4.2：有线连接、已配对、开发者模式启用、CoreDevice tunnel connected。
- `devicectl device info apps` 查询成功；返回的用户应用中不存在名称/Bundle ID 含 `Mobilerun`、`WebDriverAgent` 或 `scrcpy` 的条目。用户也明确确认已删除该 App。
- 主进程 `src/main/lib/devices/ios.ts` 的启动入口直接请求 WDA `/status`，没有 Runner 安装、签名或启动步骤。
- `src/renderer/native-mirror/StatusCard.tsx` 仅显示准备清单和重试按钮；重试重新连接，不部署手机端软件。
- `script/build.mjs` 排除 `build/ios-wda`，发行包不携带本机 WDA 源码/签名缓存；`script/ios-wda.mjs` 是独立的 Xcode 源码构建/安装流程。
- 开发机缓存的 Runner profile 覆盖当前设备且尚未过期；这只能说明可恢复这台已注册设备，不能代表任意新设备可使用相同签名。

## 与 macOS 签名的区别

Developer ID Application、公证和 Gatekeeper 验收只覆盖 Mac 程序与 DMG。iPhone 的开发测试 Runner 仍有独立的签名、设备覆盖、安装、启动及系统授权要求。前一任务未执行 iPhone 清空后的首次部署验收，不能由桌面 smoke 成功推断首次 iPhone 投屏成功。

## 下一步

1. 免费 Apple ID 登录、重签名、安装、CoreDevice 启动和本项目 ReplayKit/Home 基础链路已在当前 iPhone 验证，profile 的 LocalProvision 与 7 天有效期已核对。正式接入前需将测试包 ID 与 AppleDouble 打包适配转成可复现流程，不能分发开发团队私钥。
2. 补验干净 Mac 的开发者镜像准备（本轮已预挂载）、断线重启和到期续签；本轮没有调用 Xcode 启动命令，不等同于已验证无 Xcode 安装的全新电脑。
3. 补齐状态诊断、自动准备和恢复流程，再从“Runner 已删除”的设备状态重新验收。必须区分首次安装、仅未启动、签名过期、用户拒绝信任、开发者模式关闭及其他客户端占用。
4. 新发行包仍需重新签名、公证及完整首次连接验收。此记录不表示该流程已实现。

## 调研来源

- [Appium 预安装 WDA 的安装和启动](https://appium.github.io/appium-xcuitest-driver/latest/guides/run-preinstalled-wda/)：第三方工具可部署预构建 WDA；运行路径按系统和 WDA 版本不同，不能直接代替本项目验证。
- [Apple 注册设备规则](https://developer.apple.com/help/account/devices/devices-overview/)：团队每个会员年度、每类设备注册数量有限，不适合作为无边界公共用户分发方案。
- [pymobiledevice3 #2151](https://github.com/doronz88/pymobiledevice3/issues/2151)：维护者说明原生视频流需要 iOS 27，旧系统仍可接收触控；Mac USB 采集加原生触控是另一候选组合，但本项目未实测，不能据此宣称本轮 iOS 26.4.2 已兼容。
