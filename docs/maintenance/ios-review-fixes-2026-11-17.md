# iOS 独立审查修复（2026-11-17）

范围为本轮独立审查确认的五项问题，保留工作区其他既有更改；未提交、推送或替换安装版。

## 修复

1. 显式重连完成时不再二次替换已工作的 GUI 输入流，避免首帧恢复后 down/up 被拆到不同队列。立即重置连接状态，兼容快速重连只有 running 通知的路径。
2. PNG 异步解码和 H.264 回调绑定连接 generation；重连/断开时重置显示元数据并丢弃旧回调，不能把旧画面发布为新截图。
3. 每个 GUI 输入在入队时捕获连接取消信号；所有 disconnected/error 通知统一取消旧输入和缓冲手势。覆盖轮询失败、视频故障、手动关闭视频失败和截图回退失败，等待几何读取的旧操作不能继续发送写入。
4. session/capture 分配结果丢失时显式保留未知归属，close 不再报告成功；只有确认 ready 且 Runner 进程 UUID 已改变才解除。未猜测、采用或删除未知资源。界面显示清理未确认及恢复说明。
5. 固定 WDA 源码增加设备端原子保护：串行创建入口拒绝占用会话；请求绑定刚观察的 Runner UUID，跨进程请求拒绝分配。客户端要求协议版本 1；构建脚本验证补丁和前后源码校验和，支持幂等应用并拒绝修改过的目标。

## 自动验证

- 修复前针对输入流、旧 PNG、延迟 GUI 写入的回归均复现失败；修复后通过。
- 全量应用测试 1202 pass / 2 skip / 0 fail（`node --test --test-concurrency=4 test/*.test.cjs`）。最终 renderer 一行快速重连状态同步修改后，相关 15 项再次通过。
- 首次默认并发全量测试有两项 HDC 截止时间测试在同步构建时超时；两文件单独复测 57/57，限制并发的完整复跑通过，未放宽生产或测试超时。
- Licia 正常与 fallback 各 606 passing / 4 pending；lint/i18n、main/renderer 构建通过。
- 真实 Electron、生产 React/PNG/WebCodecs、模拟 IPC：中英文 × 深浅主题 × 280/460px；新升级/清理未知提示、重连后点击、PNG/H.264 切换通过。首次运行暴露快速重连无 starting 通知的输入流问题，修正后重新全流程通过。[UI 证据](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/review-fix-ui.json)。
- 独立后端复核 62 项通过；独立前端现有 15 项和额外交错 4 项通过，未报告剩余阻断问题。

## 真机与限制

已重新构建、签名、安装并启动带补丁的专用 WDA，使用当前连接的 iPhone 13。两个同时发出的 session 创建请求：一个成功、一个 busy，胜出会话保持不变；清理仅删除测试自己创建的 ID。旧 Runner UUID 的创建请求被拒绝且未创建会话。[脱敏证据](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/review-fix-wda-atomic.json)。

最新桌面源码构建的实测结果见下方补充。原 WDA 长期连接自行中断的根因、多次快速拔插、锁屏/旋转及 Windows usbmux 仍未验收；本轮修复的是审查指出的生命周期和归属错误，不把单次通过当作长期稳定性结论。

最新源码桌面版已沿用用户配置运行，默认 ReplayKit 视频输出 780×1688；显式重连后 running/video，截图 generation 从 5 增至 10，帧未过期。CLI 点击打开实用工具；重连后以真实 Chromium 鼠标事件点击 Canvas 打开计算器，观察截图确认成功。Android 概览再次读取到 M2007J1SC 和 Android 13 等信息。验证租约已释放，GUI 和专用 Runner 保持运行；本地运行日志没有新增输入/连接错误。设备屏幕、UDID 和原始运行日志不入库。[真机脱敏汇总](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/review-fix-device.json)。
