# iOS USB 投屏与控制

用户已选择 WDA + ReplayKit：先截图与点击，再连续视频。2026-11-16 用户确认尚未配置签名和设备，本轮交付代码与自动验证；真机验收不标完成。

## 方案与边界

采用 droidrun/WebDriverAgent 固定源码 8ce9d6f528e6f6c01bc0fa903b33555842d43571。应用直接经系统 usbmux 服务连接指定 UDID 的设备端 WDA HTTP 和视频 TCP 端口，不运行闭源 mobilerun-ios，不增加运行时 iproxy 依赖。AirPlay 保留独立只读入口。桌面继续使用 Electron/TypeScript，手机端使用上游 Objective-C WDA/ReplayKit。

直接调用 mobilerun-ios 更快，但依赖闭源二进制；AirPlay 加 WDA 控制需要额外确认画面与 UDID 的绑定。选择完整 USB 会话，使画面和输入共用明确的设备身份。

## 行为

- 发现 USB iPhone 后可启动独立会话。WDA 未运行时提供双语准备提示，不把 USB 可见等同于已可控制。
- 首先请求 WDA PNG 截图，显示在现有 Canvas；支持点击、批次滑动、文本及明确支持的按键。手势在抬起后提交完整动作，取消不得执行未完成的手势。
- 每次输入检查设备逻辑尺寸和屏幕方向，防止缩放/旋转造成错点。视频像素、窗口坐标与 iOS points 分开处理。
- 用户显式开启连续视频后启动本会话 H.264 scrcpy 分帧流及 ReplayKit 广播。截图模式可独立使用，不依赖视频成功；视频故障明确反馈并恢复截图模式。
- 视频只停止自己创建的 capture session。已连接的系统广播可供新建的自有 capture 使用；不停止全局广播，录屏指示由手机端结束。关闭、失败、取消期间清理自己的 socket 和有界请求。
- 按 UDID 隔离多设备；掉线不得转连其他手机。请求有总截止、响应大小上限；写操作不自动重试。
- GUI 与 MCP 使用原有会话所有权、输入互斥和帧新鲜度规则。AirPlay 继续拒绝输入。

## 准备与验证

提供固定 SHA 的 WDA 源码获取与 Xcode 构建/运行脚本。签名 Team ID 由用户显式提供，不保存账户密钥；不自动注册开发者账户、不改变全局 xcode-select。本轮允许未签名编译验证；真机需要信任电脑、Developer Mode、有效签名及保持测试 Runner 运行。

自动验证覆盖真实回环 TCP 的 usbmux/HTTP 分帧、错误与超时、PNG 校验、坐标映射、输入不重试、视频分帧及资源归属；补 GUI/MCP 路由、双语界面、构建和全量测试。长期视频、签名安装、旋转和物理拔插留待真机验证。
