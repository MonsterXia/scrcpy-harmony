# iOS USB：WDA 控制与 ReplayKit 视频

本开发版已接入 USB iPhone 的 PNG 截图预览、点击/拖动/滚动、文字、Home/音量键，以及显式开启的 ReplayKit H.264 视频。截图与输入通过 WDA；连续视频通过 ReplayKit Broadcast Upload Extension。两条链路都绑定所选 UDID，经系统 usbmux 传输，不使用 Wi-Fi 地址或运行时 iproxy。

**当前验收范围是代码、自动测试与未签名编译，尚未完成签名安装或真机验收。** 用户本轮选择先完成代码与自动验证。现有 AirPlay 接收器保持独立，只看画面，不提供控制。USB iPhone 出现在多端投屏的可用设备列表和概览选择器；概览读取公开设备信息无需 WDA 或开发者模式，不启用鸿蒙专用工具。名称、系统版本、型号标识、构建版本、CPU 架构、UDID 等按设备返回值显示；受限或未返回的字段显示“未知”。此信息读取已通过真机验证，WDA 截图/控制验收仍待签名配置。

## 准备 Runner

需要 macOS、完整 Xcode、可签名的 Apple 开发团队，以及已信任电脑、启用开发者模式的 iPhone。Windows 主程序的 usbmux 接口沿用 Apple Device Service，但本轮未验证 Windows，Runner 仍需在 Mac 上准备。

```sh
# 下载并核验固定提交；源码和构建缓存位于 build/ios-wda（不跟踪）
npm run ios:wda -- fetch
# 无需账户：仅验证 iOS arm64 编译，不能安装到手机
npm run ios:wda -- build --unsigned
# 配置签名后，在连接的手机上构建、安装并运行专用 WDA
npm run ios:wda -- run --udid <UDID> --team <TEAM_ID>
```

保持最后一条命令运行，再在 Scrcpy Plus 中启动对应 USB iPhone。`--allow-provisioning` 可显式允许 Xcode 更新签名配置；默认不允许。可指定 `--bundle-id io.example.WebDriverAgentRunner`、`--xcode /Applications/Xcode.app/Contents/Developer`。脚本不修改全局 `xcode-select`，不保存账户密钥。默认 Bundle ID 根据 Team ID 区分。不要与 Appium 或其他客户端共用这个 Runner；已存在 WDA session 时应用拒绝覆盖。启动响应丢失而无法确认 session ID 时，重启专用 Runner 后重连。

准备脚本在固定上游源码上应用 `manifest.json` 登记的小补丁：`FBTCPSocket` 媒体监听默认绑定 `127.0.0.1`，覆盖 ReplayKit、MJPEG 和音频端口；HTTP 通过 scheme 的 `USE_IP=127.0.0.1` 绑定。补丁前后整文件 SHA-256 均核验，缓存漂移会拒绝构建。请使用本项目准备的 Runner，原始上游 Runner 的媒体端口默认可从局域网访问。源码及签名缓存不进入桌面发行包。

首次启动会创建自己的 WDA session，设置 `screenshotQuality: 0` 取得 PNG，再开始约 700 ms 间隔的串行截图。截图显示后可以点击；浏览器像素映射到 WDA 逻辑点，提交前检查屏幕方向与尺寸。拖动在松开时一次提交，取消/窗口失焦会丢弃手势，不会补发点击。USB 未连接、Runner 未启动、签名/开发者模式未就绪时，窗口显示 WDA 准备提示。

## 连续视频

截图可用后点击「开启连续视频」。应用创建自己的 H.264 capture，连接返回端口，并请求启动 ReplayKit 广播；如果 iPhone 显示系统录屏授权，请在手机上完成。上游提供的广播启动交互不能替代设备上的授权和系统限制。已连接的广播可复用。

视频走 scrcpy 12 字节帧头 + Annex B H.264，复用 Electron WebCodecs 解码与背压。首个配置帧会缓存，丢帧后等关键帧恢复。视频断开、10 秒无视频包或检测到屏幕旋转时停止当前 capture，回到截图；再次点击可重启视频。切换期间可能有短暂停顿。自动化截图来自实际解码后的 canvas，不包含按钮和窗口边框。

「切换截图模式」只关闭本会话的视频流并切回截图。**要关闭手机上的录屏指示，请在 iPhone 上结束屏幕广播。** 上游没有原子化的广播所有权停止接口，所以客户端不发送全局 `broadcast/stop` 或 stop-all，以免停止别的 capture；只停止自己创建的 capture ID。关闭投屏时清理自有视频 socket、capture 和 WDA session。

停止响应丢失时，使用只读查询确认自有 capture/session 已消失才认可清理成功；未知或仍存在时保留失败供重试，不将断线直接当作清理完成。

## 限制与验证

- 不提供 AirPlay 反向控制；不做系统权限绕过、音频播放、DRM 视频、多指手势。
- iOS 支持 Home、音量、Enter、Backspace、Tab；Android 的 Back、Power、方向键不是 iOS 操作。
- GUI、CLI/MCP 共享会话与输入互斥；CLI/MCP 的坐标操作必须引用当前截图帧。视频开关当前在 GUI 提供。状态不明的写请求不会重试，后续输入被阻断，需重开会话。
- WDA 使用已核验公开 fork：[固定源提交](https://github.com/droidrun/WebDriverAgent/tree/8ce9d6f528e6f6c01bc0fa903b33555842d43571)，归档 SHA-256 与许可证见 `vendor/ios-wda/`；不依赖闭源 `mobilerun-ios` 二进制。
- 自动测试包含真实回环 USB/HTTP 模拟端点、JSON/分帧、目标 UDID、超时/取消、输入坐标与时长、资源清理；Electron 测试运行生产 React 组件、PNG 解码及真实 H.264 编解码，设备 IPC 为模拟。
- 历史 Xcode 26.6 未签名构建成功，包含 Broadcast 扩展；回环监听补丁后的编译由 dev.2 Build 另行验收。上游仍有编译/静态分析警告，不能把编译成功视为设备兼容性结论。

下一步在有签名账户和真机后验证：安装/启动 Runner → PNG 截图 → 点击 Home/系统设置 → 连续视频授权和长时间播放 → 横竖屏/180°/锁屏 → USB 拔插 → 关闭与重连 → GUI/MCP 并发。验证命令与证据见[维护记录](../maintenance/ios-usb-wda.md)。
