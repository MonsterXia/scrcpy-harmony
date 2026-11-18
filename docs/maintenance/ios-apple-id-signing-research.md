# Apple ID 签名可行性调研（2026-11-17）

## 结论与验证范围

用户从“可以探索登录 Apple ID 的方案”进一步授权验证免费签名、安装和启动，并亲自登录、确认签名安装和完成手机信任。**本轮已在 iPhone 13 / iOS 26.4.2 跑通免费 Personal Team 签名、安装、CoreDevice 启动、Scrcpy Plus ReplayKit 画面和 Home 控制。** 这是借助独立验证工具的真机结果；桌面产品尚未集成自动准备与续签，不能说公开安装包已经修复首次连接。

第一轮只读调研未使用账号或更改手机；随后验证轮由用户在 iloader 本机窗口输入账号密码与验证码，不经过聊天。经用户确认后由 iloader 管理签名身份并安装 Runner，没有接受任何撤销已有证书的操作，也未读取私钥或 notarytool 凭据。手机端状态已从“无 Runner”变为“免费签名 Runner 已安装并运行”。

## 已核对的候选实现

上游源码只读克隆到临时目录，未加入项目依赖。以下固定版本便于后续复核，不代表已选定正式依赖。

| 候选 | 源码证据 | 适用性与缺口 |
| --- | --- | --- |
| [isideload](https://github.com/nab138/isideload/tree/326e56229d0727cb6e7b34c8cf03e37e2cd3e17d) | Rust，MIT；`auth/apple_account.rs` 提供密码与 2FA；`sideload/builder.rs` 支持团队选择和证书额度处理；默认存储支持系统 keyring；安装依赖 idevice | 适合评估为随桌面包分发的独立 helper；当前 README 明确 entitlement 处理尚待完善。不能照搬示例把密码放进命令行，不能默认选择第一台设备或第一个团队。 |
| [xtool / XKit](https://github.com/xtool-org/xtool/tree/5318ebc7c0540f8e4c39d436c80604fa155d7a09) | Swift，MIT；`AuthCommand.swift` 与 `AuthToken.swift` 分离密码认证和保存的会话；macOS app 使用 KeychainStorage；提供自动 provisioning 与重签名 | 可作为 Mac 原型或交叉参考；当前包最低 macOS 14。免费账号证书替换分支可能撤销既有证书，不能不经审查接入自动流程。完整依赖许可、打包大小与签名公证仍未审计。 |

优先调研 isideload 的独立 helper 接入，保留 XKit 作对照。这是正式集成的技术建议，尚未接入产品；下文的独立工具真机验证已通过。独立 helper 可避免把签名依赖直接放入 Electron renderer，也便于分平台构建；不是让普通用户安装额外工具。

## 登录与凭据

- 两个候选均使用 Apple 的非公开开发认证协议，并非网页 OAuth 式“通过 Apple 登录”。当前路径需要账户密码和可能的双重认证，不能把 macOS 公证用的 App 专用密码当成已经验证可用的登录凭据。
- 所检查的默认实现均依赖远端 Anisette 服务：isideload 为 `ani.iloader.app`，XKit 为 `mac-ani.jkcoxson.com`。服务辅助产生认证所需的数据；不应把它误称为已验证的纯本地认证。XKit 源码请求中该服务接收生成的标识和 provisioning 数据，账号认证走 Apple；尚未做运行时网络审计。
- [iloader 发布记录](https://github.com/nab138/iloader/releases) 包含近期认证服务变更与兼容修复。需固定版本、限定重试次数并支持明确的重新授权状态，不能承诺一次登录永久有效。
- 若进入实现：密码只作当前认证输入，不进命令行、环境变量、日志或普通配置；会话与私钥保存到系统凭据存储。仅传输必要状态给 renderer，退出登录可清除本应用持有的凭据。不得读取或复用 Xcode/其他工具的私有登录缓存。
- isideload 默认证书额度行为为报错；应保持这一边界。XKit 的 `DeveloperServicesFetchCertificateOperation.swift` 在免费团队缺少可复用 identity 时会进入证书替换流程，必须显式处理，避免影响用户其他侧载应用。

## 免费账号的实际边界

[Apple 官方 Personal Team 说明](https://developer.apple.com/help/account/basics/about-your-developer-account) 当前列出：最多 10 个 App ID、3 台设备、每台设备 3 个应用，相关 App ID/设备登记及安装描述文件有 7 天期限。Apple 官方描述的是 Xcode 工作流；第三方工具对该流程的实现不是 Apple 对本产品的兼容承诺。

因此续签策略必须读取实际 profile 到期时间，在电脑运行、手机可连接且网络与会话有效时提前更新；过期后引导重新连接和授权。不承诺电脑关闭或手机不在场时仍能完成续签。账号可能需要先接受开发者协议；登录成功与拥有可用 Personal Team 也需分别检测。

## 本项目 WDA 包核对

检查旧工作区已有签名产物 `build/ios-wda/signed/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app`，没有修改产物或输出私钥：

- 主 Runner 的签名 entitlement 包含 `application-identifier`、`com.apple.developer.team-identifier`、`get-task-allow` 和 `keychain-access-groups`。
- `PlugIns/WebDriverAgentBroadcast.appex` 有独立 Bundle ID 与 entitlement，不能只重签主程序。
- `PlugIns/WebDriverAgentRunner.xctest` 是测试 bundle，需要保留且正确处理嵌套代码签名；不能把一般 IPA 安装成功视作 WDA 服务可运行。
- 主 Runner 与广播扩展当前使用同一团队的层级 Bundle ID。用户团队替换时需核对重写后的 ID、描述文件、嵌套签名、运行时广播扩展选择及会话归属补丁。
- 第一轮未以免费账号请求 profile；后续真机验证已确认免费 profile 和 ReplayKit 基础播放通过，见下文。实际消耗的 App ID/应用额度仍未单独测量。

现有 `script/ios-wda.mjs` 在开发机通过 Xcode 编译；可探索开发/CI 预编译后在用户机重签，用户不需要编译环境。现有脚本和打包排除规则没有因此改变。

## 安装之外仍需解决启动

[Appium 预安装 WDA 指南](https://appium.github.io/appium-xcuitest-driver/latest/guides/run-preinstalled-wda/) 提供无需 `xcodebuild` 的预安装启动路径，但要求匹配版本、开发者磁盘镜像及 RemoteXPC 等条件，并区分 iOS 17–26 与 27 的回退行为。本项目使用带 ReplayKit 的固定 fork；下文验证了 CoreDevice 原生启动，未通过 DVT XCTest 启动，不能概括为所有预安装路径均兼容。

签名工具只解决一部分链路。产品验收必须在不依赖已安装 Xcode、不借用 Xcode 自动挂载状态的环境下，完成 USB 配对、必要镜像准备、安装、测试服务启动和 `/status` 就绪。信任电脑、开发者模式、系统录屏确认仍由用户在系统界面完成。

## 独立工具验证

### 验证准备（2026-11-17）

用户进一步明确授权继续验证免费 Apple ID 签名、安装及启动，登录时由用户接管。已从官方 Release 下载 iloader 2.4.1，核对发布资产 SHA-256、deep/strict 签名和 Gatekeeper（Notarized Developer ID），审查对应 tag `9797ecaf6ccdcfc68bd2ef4e0b1123910dd847b6` 的认证、证书额度回调与安装入口。以未勾选 Save Credentials 的登录窗口交给用户。它固定使用 `ExtensionsBehavior::ReuseMain`，团队选择尚为 TODO；本轮须使用无付费团队的个人账号，扩展兼容性不能预先认定。

另在用户缓存的独立 venv 准备 pymobiledevice3 11.57.1。用 USB lockdown 确认 iOS 26.4.2、开发者模式启用、无 WDA，userspace USB RemoteXPC 查询到 testmanager 和 appservice，命令未调用 Xcode。设备已挂载一个开发者镜像，因此尚不能声称完成无 Xcode 的首次镜像准备。复用此前未签名 WDA 编译产物打包测试 IPA，保留 Runner、XCTest 和 ReplayKit 扩展，没有改变原产物或正式桌面包。

用户报告首次登录失败，未提供错误码；第二次由用户操作登录成功，GUI 显示已登录。用户在工具要求的凭据创建确认点明确授权“确认签名并安装”。阶段证据见 [验证记录](evidence/ios-apple-id-validation-20261117.json)，不包含账号、密码、配对记录或设备标识。

### 真机结果与必要适配

1. 原始 IPA 被 isideload 拒绝：`WebDriverAgentRunner.xctest` 的 CFBundleIdentifier 是主 Runner ID 的父级，签名库把它归为 extension，要求必须属于主包的子级。只在缓存中的验证副本将它改为 `<主 Runner ID>.tests`，保留测试包路径和 CFBundleExecutable；当前项目源码和原编译产物不变。
2. 第二次签名完成，但手机安装器将 ditto 生成的 `._WebDriverAgentBroadcast.appex` 当作扩展并拒绝安装。原压缩包含 31 个 AppleDouble 元数据条目。改用 zipfile 按文件列表生成干净 IPA，排除 `._*` / `__MACOSX`，检查 Mach-O 执行权限保持不变。
3. 第三次 iloader 显示 `Operation completed`。独立 InstallationProxy 查询确认唯一目标 Runner 已安装；Misagent profile 的 `LocalProvision=true`、`get-task-allow=true`，覆盖目标设备，创建时间 `2026-11-17 12:02:45 UTC`，到期 `2026-11-24 12:02:45 UTC`，有效期恰为 7 天。这是本轮免费账号的实证，不依赖历史付费签名。
4. 首次启动被 SpringBoard 安全检查拒绝；用户在手机设置中完成开发者信任。之后 pymobiledevice3 的 `developer dvt xcuitest` 可以收到 `testRunnerReadyWithCapabilities`，但没有启动 HTTP 服务，该路径未通过，握手停滞原因没有进一步定论。
5. 结束本轮 DVT 启动器后，改用 `developer core-device launch-application --userspace --udid <目标设备> --console --env USE_IP=127.0.0.1 --env USE_PORT=8100 <已安装 Bundle ID>`，由 CoreDevice 明确替换该测试 Runner 的旧进程。日志显示 `UITestingUITests/testRunner` 执行、HTTP 监听 `127.0.0.1:8100`、广播控制监听 `127.0.0.1:9300`。整个认证、签名、安装、启动阶段没有调用 xcodebuild/devicectl；预编译 WDA 本身仍由开发机 Xcode 生成。
6. USB `/status` 返回 HTTP 200、`ready=true`、项目协议版本 1 和 Runner 身份。现有正式签名桌面包点击“重试”后实际显示 iPhone；工具栏为“ReplayKit 视频 · USB 控制”。点击 Home 后画面从第二页回到第一页，验证了基础控制和画面更新。没有将观察截图存入仓库。
7. 仅结束本轮 CoreDevice 控制台监听进程（SIGINT），没有终止手机 Runner。监听器退出后两次 USB `/status` 仍为 ready，桌面拥有的 session 仍存在。当前手机 Runner 与桌面投屏保留运行，验证用 DVT/控制台进程均已退出。

成功测试 IPA 位于用户缓存 `~/Library/Caches/ScrcpyPlusValidation/apple-id-20261117/ScrcpyPlus-WDA-clean.ipa`，SHA-256 为 `a739e0a28518cf6d742bdb220bd852b811a654e4fbdb061fa997f6af2eb2f34a`；它是待用户账号重签的验证输入，不是可公开安装的通用已签名 iOS 包。

### 待完成

1. 在未安装 Xcode、没有预先挂载开发者镜像的 Mac 上验证首次镜像获取/挂载。本轮 Mac 已有 Xcode，且连接前镜像已经挂载，只证明所用签名安装启动命令未依赖 Xcode 进程，不能替代干净环境验收。
2. 验证断线、手机重启后的重新启动，以及授权取消、会话失效、profile 到期、额度不足与续签恢复。本轮没有验证自动续签，也没有测试其他 iOS 版本或 Windows。
3. 正式接入前把本轮两处包适配纳入可复现的构建/重签流程；处理每个嵌套 bundle 的标识和 entitlement，不能把手动改过的临时 IPA 直接当作正式源码产物。
4. 产品需有明确团队选择、证书额度保护、凭据管理及第三方认证辅助服务说明；账户不得默认选第一团队，设备不得默认选第一台。首次信任、开发者模式和录屏系统确认仍需引导用户操作。
5. 接入首次连接界面、IPC 和打包后更新中英文，重新签名、公证并产出候选包。本轮未修改产品代码、未重打包桌面发行版。
