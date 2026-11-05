# Scrcpy Plus：源码集成的跨平台投屏

最初基于 MonsterXia/scrcpy-harmony 的 codex/release-1.0.5-dev.0-evidence 分支，2026-11-05 已同步至上游 master `c53363659f8036336f44dc53eb8ab3a97c2022f8`，包含 v1.0.5-dev.1 发布源码 `c4bf7cf697585184e5613eaf51c3288526d44f86` 及后续发行证据。本次通过临时集成分支向标准 `master` 交付。保留上游版权与 AGPL-3.0 许可证。以下是当前源码模式；先前的外部工具模式已移除。

dev.1 合入商店空响应按应用缓存（避免后续图标被全局冷却抑制）、UITest 复合版本标记解析、TCP/Unix 协议系列兼容选择与外部活动服务保护。Plus 的产品标识、Android/iOS 源码集成、窗口隔离及安卓 USB 黑屏修复保持为本地改动。上游安装和真机证据属于 Scrcpy Harmony，不代表 Plus 已通过对应验收。

## 功能入口

左侧顶部「多端投屏」是独立入口，使用手绘 SVG 三屏图标、彩色渐变和选中描边；窄侧栏保留图标及 tooltip，展开侧栏显示名称和三种系统。路由仍为 `devices`，原持久化配置继续兼容。主页面不再显示绕过所选启动模式的通用投屏按钮。下方「鸿蒙设备工具」保留设备切换、概览、应用、截图、终端、日志、进程、布局和网页入口。左侧仅列出鸿蒙设备，保存在 `target`，供原工具和 HDC 入口使用；多端投屏页单独使用 `mirrorTarget`，可选择全部平台，启动及排列均读取此选择。两者各自持久化与刷新，互不修改，也不因切换选择而停止已有会话。旧版共享的 Android／iOS 选择迁移到 `mirrorTarget`，原 `target` 清除后从可用鸿蒙设备中恢复；设备断开时不会将安卓分配给鸿蒙工具。此前因安卓选择而禁用侧栏及对应提示已移除。验证见 [独立选择记录](evidence/independent-device-selection-2026-11-05/ui.json)。导航在 `src/renderer/main/components/workspace/Workspace.tsx`，专属图标在同目录 `MultiMirrorIcon.tsx`。中英文、宽窄窗口和明暗主题验证见 [界面证据](evidence/multi-mirror-navigation-2026-11-05/ui.json)。

## 运行结构

| 平台 | 应用内实现 | 设备发现 | 投屏及操作 |
| --- | --- | --- | --- |
| Android | 本地 Tango TypeScript ADB/scrcpy 协议源码 + USB 库 + 从源码编译的 scrcpy 3.3.3 手机端服务 | 直接枚举 USB ADB 接口 | 应用内 H.264 画面、点击/拖动/滚动、系统键、键盘和文字粘贴 |
| Harmony | 保留原 HDC/uitestkit 与原生视频/JPEG 实现 | 原 HDC 监听 | 保留原投屏和输入能力；窗口绑定独立设备 |
| iOS | UxPlay 接收核心、libplist/PlayFair/llhttp/mDNS 源码编译的 Node-API 模块 | 应用直接实现 usbmux/lockdown 查询；无线手机发起 AirPlay 后连接接收器 | 应用内 H.264 画面，暂不反向控制 |

Android/iOS 的运行代码不启动 adb、scrcpy、UxPlay、idevice_id 或 ideviceinfo 可执行文件，也不查找它们的路径。原“工具路径”设置已移除。安卓通过 USB 协议在手机端启动自带采集服务，不启动电脑端 scrcpy 程序。

USB 库是应用的生产依赖，当前固定 `usb@2.19.1` 的 libusb 后端。安卓读写端点设置一秒超时，读取空闲超时继续等待；清理按成功 claim 的接口记录释放，断连后不再读取配置描述符，并始终尝试关闭原生句柄。已有失败／断连窗口再次启动时会重试后端。2026-11-05 已验证三星实际拔插后无需重启应用即可恢复，鸿蒙继续运行且双端合并出图；见 [恢复证据](evidence/samsung-usb-reconnect-2026-11-05/verification.json)。

iOS 原生模块在进程内 Node worker 中加载，原生线程停止不会阻塞 Electron 主线程；mDNS 服务发现也内建于模块，不依赖单独的 Bonjour/GStreamer/UxPlay 程序。OpenSSL、libplist 等静态链接进模块。本机 `otool -L` 显示仅依赖系统 libc++/libSystem。

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

启动模式支持「单端（当前设备）」「安卓＋鸿蒙」「全部（三端）」；排列模式支持「独立窗口」「并排排列」「合并排列」，共九种组合。选择后点击「按模式启动」，会打开该范围的可用设备并应用所选排列。只调整已有会话时点击「应用排列」；这不会启动尚未打开的设备。其他已连接会话保持运行，模式切换不自动停止它们。单端可在设备选择器选择任意平台，双端／全部模式自动按平台筛选并归一 iOS 接收器，缺失平台会明确提示。

排列请求经 `applyMirrorLayout` 验证模式和设备 key 列表后，过滤真实活动窗口。合并视图随所选设备数量显示对应列，只有实际活动的来源才显示；iOS 存在时仍在最右侧。实现入口为 `src/renderer/main/components/devices/modes.ts`、`src/main/window/mirrorLayout.ts`；九种组合与会话保持验证见 [verification.json](evidence/start-layout-modes/verification.json)。

三端可以同时投屏：安卓与鸿蒙保持各自的 USB／HDC 连接，iPhone 通过同一局域网的屏幕镜像连接。投屏页先选启动模式与排列模式，再点击「按模式启动」；也可用「并排排列」快捷按钮，然后使用系统截图工具截取窗口。切换当前选择或单独关闭一个窗口不关闭其他会话。2026-11-05 已用三台真机验证同时出图与安卓独立重开，见 [并发证据](evidence/three-platform/live.json)。

「并排排列」右侧的「合并排列」将每台选中设备的画面放入一个窗口，按 Android／HarmonyOS／iOS 排列，同系统多设备各占一栏，顶部仅保留系统名称。参与组合的单端窗口隐藏并保持后台解码，切换为独立／并排、关闭组合窗口或排除某端时恢复原显示与后台节流策略，不重建设备连接。组合模式用于查看和截图；需触控时切回单端／并排。每端独立异步导出原尺寸 JPEG（质量 0.95），每端最多一个未完成任务；组合窗口约每 66ms 读取最新完成帧，不等待其他端，不累积队列。临时失败保留上一帧，源退出后移除对应列。IPC 只接受组合窗口主文档。实现入口为 `src/main/window/mergedMirrors.ts` 和 `src/renderer/merged-mirror/`。三台真机旧实现证据见 [live.json](evidence/merged-view/live.json)；本次安卓＋鸿蒙窗口隐藏、模式切换和持续刷新检查见 [验证记录](evidence/merged-refresh-2026-11-05/verification.json)。

安卓设备开启 USB 调试，插入后自动列出；选择设备并打开投屏窗口，在手机上确认首次 RSA 授权。主机私钥以受限权限持久化于应用配置目录，写完临时文件后原子发布，避免两台手机首次同时授权时读取到半写入密钥。USB 接口不能与其他调试客户端同时占用；若连接失败，应关闭占用该接口的其他调试程序。应用不会自动结束全局 adb 服务。

有序列号的设备按序列号区分；无序列号的 USB 设备使用总线/物理端口作为连接标识，不凭型号合并。当前安卓源码后端只接 USB，尚未实现无线调试配对/TLS 或远程 ADB 服务。

安卓画面位于应用内 Canvas，触摸坐标按实际视频区域换算，避开留白；只跟踪一个主指针。切换设备不改变已有窗口的目标。文本使用手机端剪贴板粘贴，可发送中文；此操作会改变手机剪贴板。当前不实现音频播放。

原生投屏窗口通过 `nativeMirrorFit` 按实际解码尺寸适配窗口与拖动比例，计入标题栏、控制区和页面留白，布局换行时重算，保持完整画面且不拉伸；全屏／最大化时保留等比显示。适配 IPC 与输入一样校验会话窗口及主文档归属。投屏页直接显示统一设备列表，可选择已经识别的鸿蒙手机，不必依赖侧栏折叠菜单。

安卓正常投屏时与鸿蒙保持简洁的画面布局：设备名放在窗口标题，隐藏常驻头部状态、底部系统键和文字输入栏，保留画面上的触控、滚动与键盘事件。连接／授权／错误提示仍显示。2026-11-05 用户已确认两平台投屏与触控正常，三星真实画面及精简布局验证见 [live.json](evidence/android-clean-window-2026-11-05/live.json)。

iPhone 与电脑处于同一局域网，在“控制中心 → 屏幕镜像”（两个重叠矩形图标）中选择“Scrcpy Plus”。音乐卡片的 AirPlay 列表只切换音频输出，不会发送手机屏幕。接收器已启动、手机已连接、手机已断开分别显示；不是只根据进程存活判断连接状态。当前允许一个活动 iOS 接收器/视频流。2026-11-05 已完成真实 iPhone H.264 出图验证，画面 498×1080，用户确认正常；与安卓会话同时运行，见 [live.json](evidence/ios-airplay-2026-11-05/live.json)。

“iOS 无线投屏接收器”是操作入口，不代表已发现一台 iPhone。USB UDID 和 AirPlay 客户端身份没有可靠绑定时，应用不将传入画面自动认作所选 USB 手机。暂不支持 iOS USB 视频采集、反向控制、从电脑自动发起镜像、音频播放或 DRM 视频。

## 代码入口

- `vendor/tango/`：原始 MIT TypeScript 协议源码、匹配声明与来源版本记录。
- `vendor/scrcpy-server/`：固定 scrcpy 3.3.3 服务端源码、构建脚本和上游提交号。
- `vendor/airplay/`：UxPlay/libplist 原始源码、各自许可证和上游提交号。
- `native/airplay/`：Node-API 桥接、CMake 构建和 OpenSSL 许可证。
- `src/main/lib/devices/android.ts`：USB 发现、ADB 身份/认证、部署内置服务、视频及输入控制。
- `src/main/lib/devices/ios-usbmux.ts`：分帧 usbmux/lockdown 协议、超时、设备信息和待信任状态。
- `src/main/lib/devices/airplay.ts`、`airplay-worker.ts`：进程内 worker、接收器生命周期和有界帧队列。
- `src/main/lib/devices/media.ts`：每窗口最多两张未确认帧；丢帧或编码参数变化后等待关键帧并恢复配置。
- `src/main/window/nativeMirror.ts`：按设备绑定窗口、独立启动/停止、校验 IPC sender/mainFrame、输入与帧确认路由。
- `src/renderer/native-mirror/`：应用内画面、状态、鼠标/键盘/文字控件；iOS 不展示安卓输入控件。
- 原鸿蒙 `window/screencast.ts` 和 `hdc/captureSessions.ts` 保留独立窗口/owner 管理。

已删除外部工具启动、查找和路径设置代码。应用名及配置目录与上游独立，未配置 Plus 独立发行源前不检查/发布上游更新。

## 验证

当前全量应用回归为 965/965，两种基础库模式各 606 passing / 4 pending；证据见 [verification.json](evidence/verification.json)。补查已复现并修复连续手势漏发抬起、首次并发授权读取半写入密钥，以及停止/启动清理失败后无法重试的问题。覆盖：源码编译、同名/无序列号 USB 设备识别、两台设备路由隔离、输入坐标、RSA 身份持久化、帧背压和重同步、直接 usbmux/lockdown 的真实回环 I/O，以及源码编译 AirPlay 模块的真实 RTSP `/info`、单实例保护、停止/重启和 worker 清理。

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
