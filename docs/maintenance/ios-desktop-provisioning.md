# iPhone 桌面自动准备与续签（2026-11-17）

## 状态

用户明确授权将免费 Apple ID 验证流程内置到桌面，并选择直接实施、跳过设计问答。**2026-11-18 已通过应用内真实登录、授权恢复、签名安装、打包程序启动 WDA、Home 控制，以及注入到期前 12 小时时钟触发的真实续签。** 干净 Mac/未挂载 DDI、真实 7 天到期与 Windows 仍未验收；不能视为全平台发行就绪。 之前独立 iloader/pymobiledevice3 成功不代替本轮集成验收。

## 实现入口

- `native/ios-sign/`：Rust helper，固定 isideload 源码与 Cargo.lock。私有 stdin/stdout 协议，Apple ID 密码和 2FA 不进入命令行或配置。登录后只将授权 token、Anisette 状态和签名 identity 保存到 Scrcpy Plus 独立作用域的系统 keyring。未采用 iloader/Xcode 的现有凭据，不自动撤销证书。支持个人/付费团队选择，只有一个团队时自动选择。
- `native/ios-device/`：固定 pymobiledevice3 11.57.1，构建为带 Python 运行时的独立程序；查询精确 USB UDID 和 bundle 的安装/profile，准备开发者镜像、通过 userspace RemoteXPC 隧道与 DVT ProcessControl 后台启动。开发者模式、信任电脑、开发者 App 信任仍由用户完成。
- `src/main/lib/ios-provisioning/`：子进程有期限、输出上限和错误码白名单；设备/账号操作互斥、取消、迟到结果防护。renderer 不能指定路径、命令、端口或任意设备，IPC 从所属 USB 投屏窗口派生目标。
- `IosSetup.tsx`：应用内登录、验证码/短信选择、团队选择、进度、系统授权提示、退出登录。新登录只由用户输入；退出登录仅删除认证授权，保留签名私钥以便再次登录复用已有证书，不自动撤销证书。明确第三方认证以及 `ani.iloader.app` 辅助服务。
- `nativeMirror.ts`：开始已管理设备的会话前准备 WDA。用户明确点击准备/登录时先释放该窗口自己的会话；后台续签不关闭活跃 GUI/自动化会话。

## 续签和会话保护

每分钟发现已连接的 USB 设备，仅处理已在本应用配置的设备。读取实际 profile 的到期时间，在剩余不超过 24 小时时重签；设备失败后间隔 15 分钟再尝试。断线不尝试，恢复连接后补做。应用退出后无常驻续签进程；授权过期则需重新登录。新配置设备和内置 WDA 内容变化也触发安装。

签名与真正安装分开：签名 helper 在发送安装数据前等待主进程再次检查。现有 WDA 必须报告就绪且 bundle 精确匹配；通过 Runner 原子的单会话创建预约安装期间的会话。预约信息原子写入用户目录私有 journal，失去创建回包时保留 unknown 状态，清理失败保留已知 session，后续仅清理自己明确持有的 session。

状态超时/解析失败属于 unknown，不得按空闲重装。新补丁的 `/status` 报告 `scrcpyPlusBundleId`，用于排除其他团队/其他 bundle。旧 Runner 缺少此字段时不会默默接管。未监听端口时，仍不能阻止另一个独立客户端在检查后同时启动 Runner；不承诺跨所有外部工具的全局互斥。

## 构建与分发

`npm run build:ios` 构建 Rust helper、固定 Python 依赖和独立 device helper，并生成 `resources/ios-provisioning`。开发机需要 Rust 1.95、Python 3.13；Mac 可用 Xcode 构建未签名 WDA，Windows 通过 `IOS_WDA_IPA` 使用同一工作流 macOS 任务生成的 IPA。`IOS_PYTHON` 可指定构建 Python；`IOS_WDA_APP` 仅用于显式选择已编译的未签名开发产物。默认构建每次执行 Xcode 增量编译；WDA 源码按上游 commit 与完整 manifest 指纹隔离到 `build/ios-wda/sources/<commit>-<manifest-sha256>/WebDriverAgent-<commit>`，补丁变化生成新缓存，旧缓存和未知编辑不被覆盖。

IPA 打包排除 AppleDouble 元数据、拒绝 embedded.mobileprovision，将 XCTest 的 bundle ID 规范为主包的 `.tests` 子级。桌面只带可重签的输入，不带本机私钥或已签名 Runner。`build/ios-wda` 和 `build/ios-provisioning` 缓存不复制到发行包。CI 通过 `ios-wda-artifact.yml` 先构建 unsigned WDA，再构建两个平台的 helpers；CI 配置尚未在线执行。

构建时逐文件校验原始 helper/IPA 哈希；运行开发版也校验。macOS 最终签名会改变可执行文件字节，打包版依赖应用包的代码签名保护 native 文件，仍校验 IPA 的固定哈希。依赖许可证随资源包含，完整发行仍需签名、公证与安装验收。

## 已有验证与待办

[阶段证据](evidence/ios-desktop-provisioning-20261117.json)：全量应用回归 1229 pass / 2 skip；最后重新授权入口变更的定向回归 81 pass；Python 4、Rust 2；lint/i18n 通过。arm64 ad-hoc 本地测试包构建、deep/strict 签名及内置 helper 协议启动检查通过，不代表已公证或完整账号验收通过。

- Node 回归覆盖续签期限、并发准备、活跃会话延后、未知状态、取消选择、迟到 restore、预约清理重试；窗口测试覆盖 iOS IPC 所有权。
- Python 验证精确目标/profile 匹配、IPA 元数据过滤及 XCTest ID；Rust 验证协议和目标约束。
- 已修复冻结程序缺少 `apple_compress` metadata 的问题；自包含 helper 在当前 Mac 已实读 iPhone 安装和到期信息。
- 重新编译带 bundle 身份的 unsigned Runner 通过；上游 ReplayKit pipeline 有一项静态分析警告，未将其称为零警告构建。
- 2026-11-18 中英文真实界面、集成登录与签名、安装包启动、真实续签均已验收（详见下文）；未挂载镜像的首次准备及其他剩余矩阵继续保留。
- 全量 TypeScript 检查仍有既有 Android/HDC/Luna 等区域诊断，不报告整体 typecheck 通过；本轮新增模块未出现在诊断中。

当前验证应用使用独立 `ScrcpyPlusValidation/desktop-provisioning` 配置。原正式签名候选、公开 Release 和日常安装版未替换。

### 2026-11-18 集成验证续测

用户已解锁 Mac，并报告 iPhone 已重启、解锁且保持 USB 连接。现场只读检查确认 USB 配对、开发者模式正常；登录前已存在 1 个挂载镜像，因此不能记作未预挂载 DDI 的冷启动通过。最新 ad-hoc 打包应用已在独立验证配置中启动并显示内置登录页，等待用户直接在应用中完成免费 Apple ID 登录。真实签名、安装、启动及续签仍未标记通过。

### 2026-11-18 登录前资源校验修复

用户反馈授权勾选框未居中、点击登录只清空密码。实际界面返回 `helper-unavailable`；现场确认安装包 7,304 个资源全部存在，但运行时 5,000 项上限拦截了完整的冻结 Python 依赖，构建校验此前没有相同上限。已统一为 20,000 项并保留路径和 IPA 哈希校验。真实文件系统大资源清单的回归测试修复前失败、修复后通过，同时验证损坏 IPA 仍被拒绝；用实际打包资源执行只读 account helper 已完成（未登录）。授权勾选框改为与整段说明垂直居中，点击登录立即显示验证状态；UI 异步提交回归也完成先失败再通过。

本轮完整应用回归 1,234 pass / 2 skip / 0 fail；Licia 两模式各 606 pass / 4 pending；lint/i18n 通过。重新构建后的界面及用户真实登录仍需继续验收，未将资源检查通过记为 Apple 登录成功。

修复包已完成 deep/strict ad-hoc 签名验证；英文与中文真实窗口均已检查，授权复选框位于多行提示的垂直中央，输入框和按钮完整显示。清单超过 20,000 项时，构建和运行时均拒绝。最新测试包等待用户重新登录，仍不宣称完整账号/设备流程通过。

### 2026-11-18 应用内登录已通过，签名遇到证书名额限制

用户在修复包内重新登录后进入自动签名阶段，窗口明确返回开发证书上限。独立进程的只读 account 操作确认系统钥匙串授权可恢复（authenticated=true，1 个团队）。本次未独立观察 2FA 挑战，不单独宣称验证码流程通过；未发生证书撤销，未成功安装新版 Runner。用户选择先只读检查旧测试证书；任何撤销须先明确具体目标和影响再确认。

只读账号清单返回 1 张有效 iOS Development 证书，machineName 为 iloader，创建于 2026-11-17 11:49:42 UTC。其 SHA-256 证书指纹与当前 iPhone 安装的 Mobilerun/WDA profile 完全匹配；未在该手机找到其他匹配的已安装应用，其他设备未检查。撤销会使包含它的 profile 失效（[Apple 官方说明](https://developer.apple.com/help/account/certificates/revoke-a-certificate)）。已向用户展示具体证书标识与影响，等待明确撤销确认；本次只读检查没有撤销任何证书。

用户明确确认后，仅撤销已核对的 iloader 旧测试证书；操作前再次匹配 ID、序列号、machineName 和 SHA-256 指纹，操作后账号清单确认目标已消失、iOS 开发证书数量为 0。已在打包应用点击检查并自动准备，使用已保存授权继续，本步骤没有再次输入密码。

### 2026-11-18 安装、启动与受控续签验收

签名安装成功后，初次自动启动返回 AlreadyMountedError：底层 auto_mount 对已挂载镜像抛出异常。已仅捕获这个特定异常并继续使用现有镜像，其他挂载错误仍失败；Python 6 项测试通过。更新后的源码 helper 真机启动成功；重新构建安装包后，先核对精确 bundle 的空闲主进程再停止并确认 WDA 端口关闭，随后只从桌面 UI 开始投屏，即可自行启动 Runner。Home 控制通过；ReplayKit 在这次 Runner 重启后首次自动连接回退到截图模式，手动开启视频后正常。此项首次视频可靠性仍待进一步验收。

续签测试调用生产 IosProvisioning.renew，将测试时钟注入为设备 profile 到期前 12 小时，系统时钟未修改；使用真实独立签名/设备组件和钥匙串授权，完成 account → inspect → install → inspect → start，最终 ready 且无占用会话。手机实读到期时间从 2026-11-25T01:29:43+00:00 更新至 2026-11-25T01:35:44+00:00。这证明真实续签路径及授权复用，不代替实际经过 7 天的长周期验收。正式签名、公证候选正在构建，原公开发行未替换。

正式签名时发现 electron-builder 将 605 个 TZif 时区数据文件逐一执行 codesign/timestamp。已在 mac.signIgnore 排除 ios-provisioning/device/_internal/tzdata 目录的逐文件代码签名；现场核对该目录无 Mach-O。这些文件仍由外层 app 资源封印覆盖，helper 可执行文件、Python 与动态库不在忽略范围内。

### 最终 arm64 公证候选

应用及独立 DMG 公证均为 Accepted，stapler 验证与 Gatekeeper 均通过。172 个内置原生代码文件逐个严格验签且团队一致。从 DMG 复制的应用通过严格签名、票据、Gatekeeper 与真实窗口启动检查；正式签名 helper 可恢复原授权，正式签名 Python helper 真机只读检查通过；保留验证配置启动正式签名应用后自动进入 ReplayKit 视频。

候选文件：`release/ios-provisioning-20261118/Scrcpy Plus-1.0.5-dev.2-mac-arm64-signed.dmg`；SHA-256 `6ac15ea40533284aa79f06912cf6ebc0518d5a5b212aaeb55f7c55dbb8f70315`。完整签名记录见 [发行候选证据](evidence/macos-ios-provisioning-signing-20261118.json)。原公开 Release、更新元数据和 `/Applications` 未替换。该阶段从 `installed/` 启动，继续使用独立验证配置。授权及签名材料没有打包，也没有迁入日常默认配置；如要转为日常使用，需要先处理本应用验证作用域的授权迁移，避免新作用域重复申请证书再次触及名额限制。

### 2026-11-18 移除挡住画面的设置按钮

用户反馈左上角「iPhone 设置」遮挡手机状态栏。已删除常驻悬浮按钮，将入口收进现有右上角标题栏工具面板，点击后先收起面板再打开设置；首次连接失败自动打开准备引导仍保留。

定向 Node 回归 11/11、lint/i18n、renderer 构建通过。实际签名应用中英文均验证入口位置、设置打开和面板收起，左上角不再显示按钮。仅替换原签名候选的 renderer，核对其余 ASAR 内容和 unpacked 布局不变后重新签名、公证并装订票据。新 app 与 ZIP 解压后均通过 deep/strict、stapler 与 Gatekeeper；旧 DMG 不包含本次布局修复。

新候选：`release/ios-toolbar-20261118/Scrcpy Plus-toolbar-fixed-mac-arm64.zip`，SHA-256 `8347f7f5df6720a65437efdd3c7e53ad3c26509b6d6b1168f5a439badc425907`。当前打开新 app，沿用已授权的独立验证配置，未迁移日常配置或替换 `/Applications`。

本轮实时画面未通过：旧 WDA 返回空响应，用户重启并解锁手机后，应用自动启动仍返回 `start-timeout`，重试也未恢复。最终只读检查确认 WDA 已安装、profile 有效、开发者模式开启，但服务不可达（availability=absent）。没有重新登录、撤销或申请证书。下一步定位重启后的 WDA 启动超时，再补真实视频无遮挡验收；此前成功连接不替代本次结果。详见[本轮证据](evidence/ios-toolbar-20261118.json)。

### PR 前独立审查与修复（2026-11-18）

三部分独立审查确认并修复：退出登录与登录/准备并发、窗口销毁或初始化等待后的迟到安装、旧预约清理后误报其他客户端空闲、退出登录删除唯一签名私钥、WDA 补丁升级复用旧源码/Runner 缓存。新增交错回归先失败再通过；完整记录见[本轮审查](ios-provisioning-review-20261118.md)。

启动链改为 DVT ProcessControl `ActivateSuspended: true`，并显式 `kill_existing=False`；新开发者镜像下 XCTest 前台启动限制参照 [Appium 官方修复](https://github.com/appium/appium-ios-remotexpc/commit/9785fa9)及[指南](https://appium.github.io/appium-xcuitest-driver/latest/guides/run-preinstalled-wda/)。这修复启动机制缺口，但不能仅凭代码改动认定先前真机超时的根因或恢复结果；真机和远端 CI 结果按审查记录继续更新。
