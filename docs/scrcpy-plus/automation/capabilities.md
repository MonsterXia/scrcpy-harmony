# 自动化能力与平台矩阵

supported 表示当前构建已有实现且平台支持；available 表示当前设备/会话条件满足。原因字段可能是 platform-unsupported、not-implemented、session-required 或设备状态。不能用“具备 GUI 能力”推断 CLI 已支持。

| 需求 | 能力 | Android | Harmony | iOS | 实现/验证入口 |
| --- | --- | --- | --- | --- | --- |
| AUTO-01/02 | 服务状态、设备发现、能力查询 | 已实现 | 已实现 | 已实现，接收器保留独立身份 | service.ts；protocol/server/cli 专项；真实 Electron 服务记录 |
| AUTO-03 | 会话/lease 管理 | 已实现 | 已实现 | 已实现，receiver 身份 | sessions/controller/runtime；Electron 模拟双 lease/GUI 隐藏/清理通过 |
| AUTO-04 | 截图与观察 token | 已实现 | 已实现 | 已实现截图；没有控制 token | 真实 Electron 模拟画布 PNG/after-action 通过；真机待验证 |
| AUTO-05 | 点击/滑动/滚动/文字/按键 | 已实现，原生控制/粘贴 | 已实现，scroll 模拟滑动 | 平台不支持 | 输入/适配器专项通过；真机输入、同尺寸180°旋转未验收 |
| AUTO-06 | 概览、应用、日志、进程、布局、端口、shell | 本轮不扩展新平台工具 | 概览/应用查询/进程已实现；其余实施中 | 不支持 | [逐操作登记](harmony-tools.md)，M4-A 本机专项通过；无 Harmony 真机证据 |
| AUTO-09 | MCP | M5 待实现 | M5 待实现 | M5 待实现 | 无宿主接入证据 |

iOS USB 条目和 AirPlay 接收器不是同一可信身份；手机须主动发起镜像。接收器 waiting 不等于已连接手机或已有画面。
