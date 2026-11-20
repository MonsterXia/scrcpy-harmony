# Scrcpy Plus：源码集成的跨平台投屏

最初基于 MonsterXia/scrcpy-harmony 的 codex/release-1.0.5-dev.0-evidence 分支，2026-11-05 已同步至上游 master `c53363659f8036336f44dc53eb8ab3a97c2022f8`，包含 v1.0.5-dev.1 发布源码 `c4bf7cf697585184e5613eaf51c3288526d44f86` 及后续发行证据。本次通过临时集成分支向标准 `master` 交付。保留上游版权与 AGPL-3.0 许可证。以下是当前源码模式；先前的外部工具模式已移除。

dev.1 合入商店空响应按应用缓存（避免后续图标被全局冷却抑制）、UITest 复合版本标记解析、TCP/Unix 协议系列兼容选择与外部活动服务保护。Plus 的产品标识、Android/iOS 源码集成、窗口隔离及安卓 USB 黑屏修复保持为本地改动。上游安装和真机证据属于 Scrcpy Harmony，不代表 Plus 已通过对应验收。

## 功能入口

左侧顶部「多端投屏」保留独立入口，窄侧栏显示图标，展开侧栏显示名称。页面按“可用设备 → 勾选批量启动 → 正在投屏”组织；USB iOS 可作为独立设备启动，AirPlay 仍为单独接收器。明暗主题共用布局，仅改变语义颜色。

侧栏不再单独提供设备选择器，选择器移入「概览」顶部，支持 Android、HarmonyOS 和 USB iPhone。`overviewTarget` 持久化概览选择；选中鸿蒙时同步原 `target`（供 HDC 工具使用），选中安卓或 iPhone 不会把其 key 传给 HDC。安卓和 iPhone 概览显示设备信息、启动投屏，其他鸿蒙专用工具入口禁用；恢复旧页面或程序选择受限页面时回到概览。AirPlay 接收器不进入概览。旧 `mirrorTarget` 配置仍兼容保留，投屏页批量选择使用本页稳定 key 集合，不读写工具选择，也不因选择变化停止已有会话。

概览只在设备 key/平台/连接状态改变时重置，五秒设备轮询产生同一设备的新对象不会清空内容或重读。`getDeviceOverview(key)` 根据当前发现的平台分派：鸿蒙复用原有限 HDC 读取，安卓执行固定只读 `getprop`、`uname -r`、`wm size`、`cat /proc/meminfo`。安卓有活动投屏时复用其 ADB 连接；无投屏时临时连接，读取后释放；停止中的连接完成清理后才允许临时连接。每条 shell 读取有超时与输出上限，超时仅取消该 shell，不关闭共享投屏连接。 USB iPhone 经 usbmux + lockdown 对显示字段逐项 GetValue，只读名称、系统/构建版本、产品/硬件型号、架构及序列号；总预算 8 秒，读取结束释放 socket，不创建 WDA session，不枚举完整属性字典。缺失字段显示未知，不以 UDID 冒充序列号。

导航入口为 `workspace/Workspace.tsx`；设备选择为 `workspace/DeviceSwitcher.tsx`；状态与生命周期见 `store/index.ts`、`overview/Overview.tsx`、`main/lib/devices/androidOverview.ts`。此次模拟设备的 Electron、中英文、宽窄窗口与明暗主题证据见 [工作区验证](evidence/mirror-workspace-2026-11-16/ui.json)。早期独立选择/九种组合记录是历史实现证据，不代表当前 UI。

## 运行结构

| 平台 | 应用内实现 | 设备发现 | 投屏及操作 |
| --- | --- | --- | --- |
| Android | 本地 Tango TypeScript ADB/scrcpy 协议源码 + USB 库 + 从源码编译的 scrcpy 3.3.3 手机端服务 | 直接枚举 USB ADB 接口 | 应用内 H.264 画面、点击/拖动/滚动、系统键、键盘和文字粘贴 |
| Harmony | 保留原 HDC/uitestkit 与原生视频/JPEG 实现 | 原 HDC 监听 | 保留原投屏和输入能力；窗口绑定独立设备 |
| iOS USB | 直接 usbmux + 固定源码 WDA/ReplayKit Runner | UDID 绑定的 USB 发现与连接 | 默认 H.264 连续视频、PNG 回退、点击/手势/文字；基本真机链路已验证，完整矩阵见 iOS USB 维护记录 |
| iOS AirPlay | UxPlay/libplist/PlayFair/llhttp/mDNS 源码 Node-API 模块 | 手机发起 AirPlay 连接 | H.264 画面，不支持控制 |

Android/iOS 的运行代码不启动 adb、scrcpy、UxPlay、idevice_id 或 ideviceinfo 可执行文件，也不查找它们的路径。原“工具路径”设置已移除。安卓通过 USB 协议在手机端启动自带采集服务，不启动电脑端 scrcpy 程序。

USB 库是应用的生产依赖，当前固定 `usb@2.19.1` 的 libusb 后端。安卓读写端点设置一秒超时，读取空闲超时继续等待；清理按成功 claim 的接口记录释放，断连后不再读取配置描述符，并始终尝试关闭原生句柄。已有失败／断连窗口再次启动时会重试后端。2026-11-05 已验证三星实际拔插后无需重启应用即可恢复，鸿蒙继续运行且双端合并出图；见 [恢复证据](evidence/samsung-usb-reconnect-2026-11-05/verification.json)。

AirPlay 原生模块在进程内 Node worker 中加载，原生线程停止不会阻塞 Electron 主线程；mDNS 服务发现也内建于模块，不依赖单独的 Bonjour/GStreamer/UxPlay 程序。OpenSSL、libplist 等静态链接进模块。本机 `otool -L` 显示仅依赖系统 libc++/libSystem。

iOS 的 USB 信息查询使用系统 Apple USB 服务：macOS 的 `/var/run/usbmuxd`，Windows 的本机 27015 端口。Windows 仍需 Apple 设备驱动/服务，安卓需可用的 USB 驱动。这属于操作系统访问条件，应用不安装或替换系统驱动。

## 从源码开发

```sh
npm ci
npm run runtime
npm run build:backends
npm run dev
# 首次编译完成后，在第二个终端执行：
npm start
```

`npm run runtime` 显式下载锁定的 Electron 45；其 npm 包不在依赖安装时自动下载运行时。

`npm run build:backends` 编译安卓手机端服务及 AirPlay 原生模块，只在开发/打包时需要构建工具：

- Android SDK Platform 35、Build Tools 35.0.0 和 JDK。可通过 `ANDROID_HOME`、`ANDROID_PLATFORM`、`ANDROID_BUILD_TOOLS`、`JAVA_HOME` 指定。
- CMake、C/C++ 编译器、Node 头文件和 OpenSSL 静态开发库。可通过 `CMAKE`、`NODE_INCLUDE_DIR`、`OPENSSL_ROOT_DIR` 指定。
- Windows 原生核心使用 MinGW/MSYS2 的 pthread 工具链，另需 `NODE_LIBRARY` 指向 Node 的导入库；Windows 构建与运行尚未验收。

支持分别执行 `npm run build:backends -- --android` 或 `-- --airplay`。CMake 可从 Android SDK 的安装目录查找；Node 头文件默认查找当前 Node 安装的 `include/node`。

`npm run build:vendor` 同时从 `vendor/tango/*/src` 重建协议模块。上游附带的类型声明保留在 `esm`；运行 JavaScript 从源码生成，不将生成的 JavaScript 当维护入口。

鸿蒙原生资源仍通过 `npm run init` 的既有流程准备。完整 `npm run build` 会编译新后端、验证版本/架构/SHA-256 并复制资源，保留鸿蒙原生资源的严格校验。不能用空文件或关闭完整性校验来绕过缺失资源。

输出：

- `resources/android/scrcpy-server`：固定版本 3.3.3，从仓库内 Java/AIDL 源码编译。
- `resources/airplay/plus_airplay.node`：Node-API 8 模块，从仓库内 C/C++ 核心和桥接源码编译。
- `resources/platform-backends.json`：服务版本、源码提交、主机平台/架构、文件大小及 SHA-256，供打包检查。

当前在本机 macOS arm64 编译通过。链接器提示本机 Homebrew OpenSSL 静态库按 macOS 27.0 构建；虽然模块使用 13.0 deployment target，也不能据此声称支持旧 macOS。面向旧系统发行时须提供符合最低系统版本的 OpenSSL 静态库并完成对应系统验收。

## 使用与能力边界

在可用设备列表勾选 Android／HarmonyOS／USB iOS 设备后点击「启动所选」，或使用行内单台启动。已存在的会话只显示在正在投屏区；失败/断开的会话可重试，单台失败不丢失其他启动结果。关闭一台不会停止其他会话。iPhone 在单独的 iOS 无线投屏区开启接收器后，从手机「屏幕镜像」选择 Scrcpy Plus；未收到连接时明确显示等待。

「独立窗口／并排／合并」直接调用 `applyMirrorLayout`，作用于全部实际活动窗口，与勾选待启动设备无关。后端保留带 key 过滤的接口兼容调用方，但本页不发送过滤范围。`getMirrorLayout` 读取合并窗口是否存在及上次排列后的窗口几何；窗口移动、数量变化或关闭合并窗口后不会继续显示失效的排列状态。「打开窗口」通过 `focusMirror(key)` 恢复/聚焦已有窗口；属于合并视图的设备聚焦合并窗口，不重新启动后端。实现为 `devices/Devices.tsx`、`main/window/mirrorLayout.ts`。

三端可以同时投屏：安卓与鸿蒙保持各自 USB／HDC 连接，iPhone 通过同一局域网 AirPlay 连接。2026-11-05 三台真机同时出图与安卓独立重开的历史后端证据见 [并发证据](evidence/three-platform/live.json)；本次 UI 改造的模拟验收不替代新的真机验证。

「合并」把每个独立窗口正在使用的 Electron `WebContentsView` 移入同一个窗口。Android、HarmonyOS、iOS 按此顺序共用画面高度，同系统多台设备各占一栏。视图贴齐内容区左、右和下边缘，相邻设备之间留 12 个逻辑像素。设备首帧、方向或数量变化时按实际比例调整窗口。每栏保留原解码器、输入焦点和平台工具栏，支持该连接在独立窗口中已有的点按、拖动、滚轮和键盘操作；AirPlay 仍仅支持查看。三个平台的标题栏高 32 个逻辑像素。鸿蒙和 USB iPhone 共用右侧的双滑杆按钮，点按展开对应的工具面板，再点关闭。两端展开后使用鸿蒙风格的图标工具栏。鸿蒙可以选择画质，USB iPhone 可以从「模式」下拉框切换 ReplayKit 视频和 WDA 截图，圆圈和齿轮分别用于返回主屏幕和打开 iPhone 设置。切回独立、并排或关闭合并窗口时，原视图回到对应窗口，会话继续运行。实现见 `src/main/window/mergedMirrors.ts` 和 `src/share/main/lib/window.ts`。见[三机真机验证](../maintenance/evidence/merged-live-controls-20261119.json)。

安卓设备开启 USB 调试，插入后自动列出；选择设备并打开投屏窗口，在手机上确认首次 RSA 授权。主机私钥以受限权限持久化于应用配置目录，写完临时文件后原子发布，避免两台手机首次同时授权时读取到半写入密钥。直接 USB 接口不可被多进程同时占用。若在认证前遇到 ACCESS/BUSY，且 USB 序列号明确，应用释放自己的 USB 句柄并尝试复用本机 127.0.0.1:5037 已运行的 ADB 服务；严格匹配唯一在线序列号并固定 transport ID，仅关闭自己的连接，不启动/停止服务或 detach 设备。无匹配服务、未授权、序列号缺失或非接口占用错误不会选择其他设备或重放操作。回退仍失败时通过固定 connectionIssue 显示 USB 提示。2026-11-16用户报告的接口占用和授权恢复见[专项记录](../maintenance/agent-automation-android-codex-2026-11-16.md)。

有序列号的设备按序列号区分；无序列号的 USB 设备使用总线/物理端口作为连接标识，不凭型号合并。当前安卓源码后端只接 USB，尚未实现无线调试配对/TLS 或远程 ADB 服务。

安卓画面位于应用内 Canvas，触摸坐标按实际视频区域换算，避开留白；只跟踪一个主指针。切换设备不改变已有窗口的目标。文本使用手机端剪贴板粘贴，可发送中文；此操作会改变手机剪贴板。当前不实现音频播放。

原生投屏窗口通过 `nativeMirrorFit` 按实际解码尺寸适配窗口与拖动比例，计入标题栏、控制区和页面留白，布局换行时重算，保持完整画面且不拉伸；全屏／最大化时保留等比显示。适配 IPC 与输入一样校验会话窗口及主文档归属。投屏页直接显示统一设备列表，可选择已经识别的鸿蒙手机，不必依赖侧栏折叠菜单。

安卓正常投屏时与鸿蒙保持简洁的画面布局：设备名放在窗口标题，隐藏常驻头部状态、底部系统键和文字输入栏，保留画面上的触控、滚动与键盘事件。连接／授权／错误提示仍显示。2026-11-05 用户已确认两平台投屏与触控正常，三星真实画面及精简布局验证见 [live.json](evidence/android-clean-window-2026-11-05/live.json)。

iPhone 与电脑处于同一局域网，在“控制中心 → 屏幕镜像”（两个重叠矩形图标）中选择“Scrcpy Plus”。音乐卡片的 AirPlay 列表只切换音频输出，不会发送手机屏幕。接收器已启动、手机已连接、手机已断开分别显示；不是只根据进程存活判断连接状态。当前允许一个活动 iOS 接收器/视频流。2026-11-05 已完成真实 iPhone H.264 出图验证，画面 498×1080，用户确认正常；与安卓会话同时运行，见 [live.json](evidence/ios-airplay-2026-11-05/live.json)。

“iOS 无线投屏接收器”是操作入口，不代表已发现一台 iPhone。USB UDID 和 AirPlay 客户端身份没有可靠绑定时，应用不将传入画面自动认作所选 USB 手机。此 AirPlay 路径不支持反向控制、从电脑自动发起镜像、音频播放或 DRM 视频。USB 路径新增 WDA + ReplayKit，使用步骤与未验收范围见 [iOS USB 接入](ios-usb-wda.md)。

## 代码入口

- `vendor/tango/`：原始 MIT TypeScript 协议源码、匹配声明与来源版本记录。
- `vendor/scrcpy-server/`：固定 scrcpy 3.3.3 服务端源码、构建脚本和上游提交号。
- `vendor/airplay/`：UxPlay/libplist 原始源码、各自许可证和上游提交号。
- `native/airplay/`：Node-API 桥接、CMake 构建和 OpenSSL 许可证。
- `src/main/lib/devices/android.ts`：USB 发现、ADB 身份/认证、部署内置服务、视频及输入控制。
- `src/main/lib/devices/ios-usbmux.ts`：分帧 usbmux/lockdown 协议、超时、设备信息、待信任状态及按 UDID 连接端口。
- `src/main/lib/devices/ios{,-wda,-video}.ts`：WDA 会话、PNG/输入、HTTP USB 传输、ReplayKit H.264 分帧及自有 capture 清理。
- `script/ios-wda.mjs` / `vendor/ios-wda/manifest.json`：固定源码获取、校验、Xcode 构建和专用 Runner 启动。
- `src/main/lib/devices/airplay.ts`、`airplay-worker.ts`：进程内 worker、接收器生命周期和有界帧队列。
- `src/main/lib/devices/media.ts`：每窗口最多两张未确认帧；丢帧或编码参数变化后等待关键帧并恢复配置。
- `src/main/window/nativeMirror.ts`：按设备绑定窗口、独立启动/停止、校验 IPC sender/mainFrame、输入与帧确认路由。
- `src/renderer/native-mirror/`：应用内画面、状态、鼠标/键盘/文字控件；USB iOS 支持输入与 `nativeMirrorVideo` 开关，AirPlay 只读；PNG/H.264 共用帧流。
- 原鸿蒙 `window/screencast.ts` 和 `hdc/captureSessions.ts` 保留独立窗口/owner 管理。

已删除外部工具启动、查找和路径设置代码。Plus 作为本项目的正式延续，发行仓库为 `MonsterXia/scrcpy-plus`；更新查询、主页、问题反馈及打包目标已切换，检查更新与预发布选项已启用。运行时和打包共用 `package.json.publish`。默认打包不上传，显式 `npm run pack -- --publish` 才发布。保持现有 Plus 应用 ID 与配置目录；Harmony 用户手动安装 Plus，不提供旧仓库解析或配置迁移分支。迁移状态与验证见 [仓库改名记录](../maintenance/scrcpy-plus-rename.md)。

## 验证

2026-11-05 集成阶段全量应用回归为 965/965，两种基础库模式各 606 passing / 4 pending；证据见 [verification.json](evidence/verification.json)。补查已复现并修复连续手势漏发抬起、首次并发授权读取半写入密钥，以及停止/启动清理失败后无法重试的问题。覆盖：源码编译、同名/无序列号 USB 设备识别、两台设备路由隔离、输入坐标、RSA 身份持久化、帧背压和重同步、直接 usbmux/lockdown 的真实回环 I/O，以及源码编译 AirPlay 模块的真实 RTSP `/info`、单实例保护、停止/重启和 worker 清理。

`SCRCPY_PLUS_NATIVE_TEST=1 npm test` 运行原生接收器测试；不设置变量时跳过需要本机原生模块及 multicast/loopback 权限的测试。`npm run check:plus-ui` 是真实 Electron 外壳配合模拟设备/会话 IPC 的双语 UI 检查，不能代替后端或真机验收。

2026-11-04 已补齐 macOS arm64 Electron 45 运行时并核对官方 SHA-256。鸿蒙库从上游官方 v1.0.5-dev.0 arm64 DMG 提取，六个库及许可证逐项通过仓库固定清单校验。实际运行发现主进程误选 plist 浏览器导出，已在 `vite.main.ts` 指定 Node 导出条件，修复 iOS USB 枚举依赖 DOMParser 的问题。

真实 Electron 双语设备选择/会话界面检查通过（模拟设备 IPC）；另一轮保留真实后端的启动检查通过：设备发现无错误、原生 AirPlay 窗口进入等待状态并正常停止。证据分别在 [双语 UI](evidence/mac-local/ui/ui.json) 和 [真实后端](evidence/mac-local/live.json)。本机未连接手机，没有真实视频/输入验收；旧的下载及启动失败记录保留，但不再是当前运行阻碍。严格 TypeScript 检查仍有继承基线诊断。

本机已构建的版本可在项目根目录执行 `npm start` 运行，无需启动 Vite。修改源码后重新构建，再启动：

```sh
npm_config_registry=https://registry.npmjs.org npm_config_prefer_offline=true npm run build
npm start
```

这里显式指定 registry 是为了覆盖本机失效的全局 npm 镜像；不修改用户的全局配置。Windows、Intel Mac 和旧系统的安装包留待本机真机验证后构建验收。

## 源码后端的 CI 工具链

CI 和手动 Build 共用 `.github/actions/platform-toolchain`，固定动作 SHA，准备 JDK 17、Android 35／Build Tools 35.0.0、macOS 静态 OpenSSL 和 Windows UCRT64 GCC/CMake/OpenSSL。`script/setup-node-build-headers.mjs` 按当前 Node 版本下载头文件及 Windows 导入库并校验官方 SHA-256。安卓编译使用 `script/lib/android-server-build.mjs` 直接调用 AIDL、javac 与 D8，Java 参数文件处理 Windows 类路径及长度限制，不依赖电脑端 adb/scrcpy 程序。Mac 本地完整构建及两项上游 UI 回归见 [同步记录](evidence/upstream-sync-2026-11-05/verification.json)；其他平台的最终构建与安装以本次 PR CI 为准。

Windows AirPlay 模块采用 MinGW 延迟导入库与宿主解析钩子，将 Node-API 指向当前 Electron 可执行文件，支持产品可执行文件重命名。GCC／C++／pthread 和 OpenSSL 使用静态链接；安装冒烟检查移除 CI 的 Node／MinGW PATH 后实际加载模块，防止开发环境掩盖外部运行时依赖。实现参考 Electron 的 win_delay_load_hook 约定和 GNU dlltool 的 output-delaylib。

## Agent 自动化入口（开发中）

`src/main/automation/` 在持有设备的 Electron 进程提供 loopback 鉴权服务；`src/cli/` 为独立 Node 客户端，不连接 USB。当前服务状态、诊断、发现、会话 lease、画布截图与 Android/Harmony 输入已实现，真实 Electron 模拟闭环通过；Android/Harmony核心点击/滑动/文字闭环已通过，本机Codex app-server实际35工具/双端PNG/Harmony XML/租约验收通过；Windows及剩余物理矩阵pending。Harmony同版本HAP覆盖/启动/停止也已补真机证据；首次/升级/清空卸载保留待验收。现有Harmony工具和MCP已完成本地候选，见[验收交接](automation/acceptance.md)。`npm run build:cli` 输出 `dist/cli`；完整 build 同时生成客户端包。显式 `SCRCPY_PLUS_PROFILE` 在单实例锁和 store 初始化前生效。协议、使用方法与验证边界见[自动化指南](automation/README.md)和[维护记录](../maintenance/agent-automation.md)。

自动化最新验证源码 `1f48fbd`：应用1094pass/2skip、Licia各606/4、lint/fullbuild/包检查/Electron模拟通过；实际Codex app-server及双真机结果见[续验记录](../maintenance/agent-automation-android-codex-2026-11-16.md)。tsc既有诊断保留，iOS按用户要求暂缓；这些结果不回写上方历史集成阶段计数。

2026-11-16 新增 iOS USB WDA + ReplayKit 代码接入与自动验收；取代上方历史阶段的“iOS 暂缓”范围，未取得真机证据。见[专项维护记录](../maintenance/ios-usb-wda.md)。

## 桌面 iPhone 准备（本地开发中）

`src/main/lib/ios-provisioning/` 通过内置 Rust 签名 helper 与冻结 Python 设备 helper 提供 Apple ID 登录、安装、启动和续签。IPC `iosSetup` 仅接受所属 USB 投屏窗口的动作，设备由主进程解析。已管理设备在创建投屏前检查；后台每分钟调度，临近到期且空闲时续签。`IosSetup.tsx` 提供双语进度与系统授权引导，入口位于 USB 投屏窗口右上角工具面板；首次 WDA 连接失败时自动打开，不在画面上常驻按钮。密码不写配置。WDA 状态包含实际 bundle 身份；安装前有会话预约和持久恢复记录。当前为本地候选，macOS 应用内登录、签名安装、启动及受控时钟触发的真实续签已验证；干净环境、实际七天到期及 Windows 仍待验收，见 [状态与边界](../maintenance/ios-desktop-provisioning.md)。

### 投屏加载态

`src/renderer/components/MirrorStatus.tsx` 和 `MirrorStatus.module.scss` 定义共享连接卡片及主题，native-mirror（Android/iOS USB/AirPlay）和鸿蒙 Screencast 在加载期间使用。设备授权、AirPlay 连接指导仍由各入口提供；加载完成沿用原有会话/首帧状态。实现及验收范围见[加载态维护记录](../maintenance/mirror-loading.md)。
