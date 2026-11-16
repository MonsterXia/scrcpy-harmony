# iOS USB WDA + ReplayKit（2026-11-16）

状态：**代码接入及自动验证完成，签名安装和真机验收待办。** 用户明确“尚未配置，先完成代码与自动验证”。工作分支 `codex/ios-usb-wda`，基线 `62a7e28727a8feb20848ba340af492516a444c5a`。本轮未替换安装版、未提交发布。

## 实现

- USB iPhone 使用独立 `ios:<UDID>` 会话；AirPlay 接收器保持独立只读。
- usbmux 按 UDID 解析当前 DeviceID，连接 WDA 8100 或动态视频端口；HTTP 有界、取消、大小检查，写操作不重试。
- WDA 创建专用 session、请求 PNG（显式 quality=0）、提供点按/滑动/滚动/文字及有限按键；实际显示尺寸和方向参与坐标校验。取消的 GUI 手势不发送到手机。
- ReplayKit 创建自有 H.264 capture，处理 scrcpy 分帧和首个配置帧，复用 FrameGate/WebCodecs，启动/播放失败或旋转回到截图。
- 不调用全局广播 stop/stop-all：上游没有原子所有权检查。只停止自己的 capture；手机端结束屏幕广播，UI 已提示。
- CLI/MCP 复用现有会话、租约、输入队列与截图帧引用。状态不明的写入隔离后续输入；已知未执行的校验失败不误报成已发送。
- 准备脚本固定源码 SHA 和归档 SHA-256，局部指定 Xcode、显式 UDID/Team；未引入闭源 mobilerun-ios。

使用命令见 [iOS USB 配置](../scrcpy-plus/ios-usb-wda.md)，设计及步骤见 [spec](../superpowers/specs/2026-11-16-ios-usb-wda-design.md) / [plan](../superpowers/plans/2026-11-16-ios-usb-wda.md)。

## 验证证据

| 检查 | 实际结果 |
| --- | --- |
| `node --test --test-concurrency=4 test/*.test.cjs` | 1147 pass / 2 skip / 0 fail |
| `node script/test-licia.mjs`，另加 `--fallback` | 各 606 pass / 4 pending |
| `npm run lint` | ESLint、双语词条检查通过 |
| `npm run build:main` / `build:preload` / `build:renderer` | 三项通过 |
| `npx tsc --noEmit --ignoreDeprecations 6.0` | 55 项既有诊断，与 HEAD 临时基线逐字一致；不是全绿 |
| `npm run ios:wda -- build --unsigned` | Xcode 26.6 (17F113)、iOS arm64 Runner + Broadcast Extension，TEST BUILD SUCCEEDED；保留上游编译和分析警告 |
| `node script/check-ios-ui.mjs` | Electron 45、生产 React 组件、真实 PNG 解码/H.264 WebCodecs 编解码、截图回退/180° metadata、中英文点按/Home/视频开关通过；设备 IPC 模拟 |
| `node script/check-plus-ui.mjs` | 真实 Electron 双语设备列表/工作区、深浅主题、宽窄窗口与概览回归通过；模拟设备 IPC，含 USB iPhone |
| 独立代码审查 | 发现并修复 4 项：广播全局停止竞态、失败不回截图、点击时长包含查询延迟、最长手势请求超时；复核无重要遗留项 |

汇总：[verification.json](../scrcpy-plus/evidence/ios-usb-wda-2026-11-16/verification.json)。中英文界面及渲染结果：[ui.json](../scrcpy-plus/evidence/ios-usb-wda-2026-11-16/ui.json)。新增测试使用真实回环 TCP 但不是物理 USB，图像是明确标注的 fixture。

初次全核并发测试与 Xcode 编译同时运行时，CLI deadline 用例出现一次调度超时（请求未到达）；最终降低测试文件并发至 4 后通过，未修改 CLI 实现。另一个初次失败源于旧测试排除 USB iPhone，已更新为当前设备列表语义。Electron 单帧 H.264 探针先因编解码缓冲未出帧超时，改为实时配置并发送连续 6 帧后验证实际解码。

## 待办：真机验收

此阶段没有可用签名身份，仅完成未签名编译，不得将测试或模拟 UI 当作真机控制成功。后续已连接 iPhone 并完成[概览和安装版验证](ios-overview.md)，WDA 签名和下列控制验收仍待办。

1. 配置签名团队、信任电脑、启用 Developer Mode，运行专用 WDA。
2. 选定 UDID，截图确认内容；点按 Home 和无副作用系统页面，验证坐标。
3. 手机上完成 ReplayKit 授权，持续视频、点击和输入，测延迟与稳定性。
4. 旋转/180°、锁屏、取消、USB 拔插、两台 iPhone 隔离、关闭/重开及 GUI/MCP 互斥。
5. Windows Apple 服务、实际驱动与已部署 Runner 的跨主机连接另行验收。
