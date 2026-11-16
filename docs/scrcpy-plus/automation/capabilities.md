# 自动化能力与平台矩阵

supported 表示当前构建已有实现且平台支持；available 表示当前设备/会话条件满足。原因字段可能是 platform-unsupported、not-implemented、session-required 或设备状态。不能用“具备 GUI 能力”推断 CLI 已支持。

| 需求 | 能力 | Android | Harmony | iOS | 实现/验证入口 |
| --- | --- | --- | --- | --- | --- |
| AUTO-01/02 | 服务状态、设备发现、能力查询 | 已实现 | 已实现 | 已实现，接收器保留独立身份 | service.ts；protocol/server/cli 专项；真实 Electron 服务记录 |
| AUTO-03 | 会话/lease 管理 | 已实现 | 已实现 | 已实现，USB UDID 与 receiver 分开 | sessions/controller/runtime；Electron 模拟双 lease/GUI 隐藏/清理通过 |
| AUTO-04 | 截图与观察 token | 已实现 | 已实现 | USB WDA 支持截图/token；AirPlay 只读截图 | 真实 Electron 模拟画布 PNG/after-action 通过；Harmony实际截图通过，锁屏after-action超时 |
| AUTO-05 | 点击/滑动/滚动/文字/按键 | 已实现，原生控制/粘贴 | 已实现，scroll 模拟滑动 | USB WDA 已实现；AirPlay 不支持 | 输入/适配器专项通过；iOS WDA 真机验收待办 |
| AUTO-06 | 概览、应用、日志、进程、布局、端口、shell | 本轮不扩展新平台工具 | 现有工具逐项已实现 | 不支持 | [逐操作登记](harmony-tools.md)，M4 四批本机专项通过；M6实际Harmony只读工具通过，写入pending |
| AUTO-09 | MCP | 已实现适配 | 已实现适配 | 已实现，USB WDA 支持控制 | SDK stdio 新旧协议、取消、图片/文件与安装包通过；iOS WDA 真机验收待办 |

iOS USB 条目和 AirPlay 接收器不是同一可信身份。USB 截图/控制需预先签名运行专用 WDA，概览读取成功不代表 WDA 可用；准备和验证边界见 [iOS USB 配置](../ios-usb-wda.md)。AirPlay 需手机主动发起镜像，接收器 waiting 不等于已连接手机或已有画面。GUI 的 iOS 概览已支持，CLI/MCP `overview.get` 仍仅支持 Harmony。
