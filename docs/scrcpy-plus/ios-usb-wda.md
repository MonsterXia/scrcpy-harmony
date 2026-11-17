# iOS USB：WDA 控制与 ReplayKit 视频

本开发版已接入 USB iPhone 的 PNG 截图预览、点击/拖动/滚动、文字、Home/音量键，以及默认开启的 ReplayKit H.264 视频。截图与输入通过 WDA；连续视频通过 ReplayKit Broadcast Upload Extension。两条链路都绑定所选 UDID，经系统 usbmux 传输，不使用 Wi-Fi 地址或运行时 iproxy。

**2026-11-17 已在 iPhone 13（iOS 26.4.2）通过签名安装、USB PNG 截图、点击/Home、ReplayKit 连续视频基本播放和截图/视频切换验证。长时间稳定性、旋转和拔插等矩阵仍待验收。** 现有 AirPlay 接收器保持独立，只看画面，不提供控制。USB iPhone 出现在多端投屏和概览的设备列表；鸿蒙专用工具不适用于 iOS。

## 准备 Runner

需要 macOS、完整 Xcode、可签名的 Apple 开发团队，以及已信任电脑、启用开发者模式的 iPhone。Windows 主程序的 usbmux 接口沿用 Apple Device Service，但本轮未验证 Windows，Runner 仍需在 Mac 上准备。

```sh
# 下载并核验固定提交，校验并应用会话归属补丁；缓存位于 build/ios-wda（不跟踪）
npm run ios:wda -- fetch
# 无需账户：仅验证 iOS arm64 编译，不能安装到手机
npm run ios:wda -- build --unsigned
# 配置签名后，在连接的手机上构建、安装并运行专用 WDA
npm run ios:wda -- run --udid <UDID> --team <TEAM_ID>
```

保持最后一条命令运行，再在 Scrcpy Plus 中启动对应 USB iPhone。`--allow-provisioning` 可显式允许 Xcode 更新签名配置，并把 `--udid` 指定的设备注册到所选团队；默认不允许。可指定 `--bundle-id io.example.WebDriverAgentRunner`、`--xcode /Applications/Xcode.app/Contents/Developer`。脚本不修改全局 `xcode-select`，不保存账户密钥。默认 Bundle ID 根据 Team ID 区分。不要与 Appium 或其他客户端共用这个 Runner；已存在 WDA session 时应用拒绝覆盖。启动响应丢失而无法确认 session ID 时，重启专用 Runner 后重连。

**升级要求：** 当前客户端需要带会话归属保护的专用 Runner。旧 Runner 会提示更新；先结束此前的 Runner 命令，再重新执行上面的 `run` 命令完成编译、签名、安装和启动。构建脚本校验补丁及目标源码的 SHA-256，重复执行不会重复打补丁；源码不匹配时停止，避免覆盖本地修改。

如果创建 session 或 capture 的响应丢失，客户端会显示“清理未确认”，保留原后端并暂停新建。此时重新启动专用 Runner，再重试；只有确认进程已变化才解除未知归属，不会尝试删除其他客户端资源。

首次签名时，macOS 可能要求允许 `codesign` 使用钥匙串中的开发密钥；在系统弹窗中完成。Runner 安装后，手机图标名称可能为上游的 **Mobilerun**。若 Xcode 报 `Developer App Certificate is not trusted`，在 iPhone「设置 → 通用 → VPN 与设备管理」中信任对应开发者 App；若系统要求重启，完成后解锁并重新运行命令。

若「VPN 与设备管理」没有开发者条目，而直接打开 Mobilerun 提示“无法验证／需要互联网连接”，先确认 iPhone 自身能联网，再重试运行。部分团队的开发 profile 要求首次联系 Apple PPQ 服务（`https://ppq.apple.com`）；USB 信任电脑不能代替这一步。不要仅凭 Xcode 的通用“证书不受信任”提示断定需要手动信任。见 [Apple 首次联网验证说明](https://developer.apple.com/help/account/provisioning-profiles/provisioning-profile-updates)。

如果新开发证书仍不被识别为有效身份，先检查 Apple WWDR 中间证书链；不要把开发证书改成“始终信任”来绕过链校验。Xcode 随附 `AppleWWDRCA-2030.cer`（G3），可在验证其系统信任链后补入登录钥匙串。

首次启动会创建自己的 WDA session，设置 `screenshotQuality: 0` 取得 PNG，随后自动开启 ReplayKit 连续视频；首张 PNG 用于尽快显示画面并确认控制坐标。视频启动失败且自有 capture 已清理时，保留约 700 ms 间隔的串行截图作为回退。连接成功后画面贴边显示，与 Android 一致；Home、视频切换和录屏提示收在标题栏右上角的调节图标工具栏中，展开不占用画面布局高度。截图显示后可以点击；浏览器像素映射到 WDA 逻辑点，提交前检查屏幕方向与尺寸。拖动在松开时一次提交，取消/窗口失焦会丢弃手势，不会补发点击。USB 未连接、Runner 未启动、签名/开发者模式未就绪时，窗口以紧凑状态卡片显示连接提示，可展开「查看连接准备」，不挤压画面；已成功出图后再中断则提示检查连接，旧帧变暗。短暂读取错误会有限重试，输入操作不重放。 USB 拔出后保留窗口，接回同一台已解锁 iPhone 且 WDA 可用时自动重建会话，并恢复此前的视频模式；不会重放断开前的输入。WDA 若已停止仍需重新启动 Runner。GUI 滚轮和移动事件会合并后串行发送，前一个手势结束前不开始新手势。若出现“操作未完成”，底部“重连控制”可清理并重建当前会话；不会补发失败的操作。

准备脚本在固定上游源码上应用 `manifest.json` 登记的小补丁：`FBTCPSocket` 媒体监听默认绑定 `127.0.0.1`，覆盖 ReplayKit、MJPEG 和音频端口；HTTP 通过 scheme 的 `USE_IP=127.0.0.1` 绑定。补丁前后整文件 SHA-256 均核验，缓存漂移会拒绝构建。请使用本项目准备的 Runner，原始上游 Runner 的媒体端口默认可从局域网访问。源码及签名缓存不进入桌面发行包。

## 连续视频

每次新建 USB iPhone 投屏窗口默认开启连续视频，无需点击开关。应用创建自己的 H.264 capture，连接返回端口，并请求启动 ReplayKit 广播；如果 iPhone 显示系统录屏授权，请在手机上完成。上游提供的广播启动交互不能替代设备上的授权和系统限制。已连接的广播可复用。标题栏右上角调节图标可切换为截图模式；同一窗口断线或手动重连保留用户的模式选择，关闭后新开窗口仍默认视频。

视频走 scrcpy 12 字节帧头 + Annex B H.264，复用 Electron WebCodecs 解码与背压。首个配置帧会缓存，丢帧后等关键帧恢复。视频断开、10 秒无视频包或检测到屏幕旋转时停止当前 capture，回到截图；再次点击可重启视频。切换期间可能有短暂停顿。自动化截图来自实际解码后的 canvas，不包含按钮和窗口边框。

浮动工具栏中的「切换截图模式」只关闭本会话的视频流并切回截图。**要关闭手机上的录屏指示，请在 iPhone 上结束屏幕广播。** 上游没有原子化的广播所有权停止接口，所以客户端不发送全局 `broadcast/stop` 或 stop-all，以免停止别的 capture；只停止自己创建的 capture ID。关闭投屏时清理自有视频 socket、capture 和 WDA session。

## 限制与验证

- 不提供 AirPlay 反向控制；不做系统权限绕过、音频播放、DRM 视频、多指手势。
- iOS 支持 Home、音量、Enter、Backspace、Tab；Android 的 Back、Power、方向键不是 iOS 操作。
- GUI、CLI/MCP 共享会话与输入互斥；CLI/MCP 的坐标操作必须引用当前截图帧。视频开关当前在 GUI 提供。状态不明的写请求不会重试，后续输入被阻断，需重开会话。
- WDA 使用已核验公开 fork：[固定源提交](https://github.com/droidrun/WebDriverAgent/tree/8ce9d6f528e6f6c01bc0fa903b33555842d43571)，归档 SHA-256 与许可证见 `vendor/ios-wda/`；不依赖闭源 `mobilerun-ios` 二进制。
- 自动测试包含真实回环 USB/HTTP 模拟端点、JSON/分帧、目标 UDID、超时/取消、输入坐标与时长、资源清理；Electron 测试运行生产 React 组件、PNG 解码及真实 H.264 编解码，设备 IPC 为模拟。
- 未签名 Xcode 构建成功，包含 Broadcast 扩展；上游仍有编译/静态分析警告，不能把编译成功视为设备兼容性结论。

已通过真机截图、点击/Home、连续视频基本播放及模式切换。下一步验证长时间播放 → 横竖屏/180°/锁屏 → USB 拔插 → 两台设备隔离 → GUI/MCP 并发。验证命令与证据见[维护记录](../maintenance/ios-usb-wda.md)。
