# Harmony 工具逐操作登记（M4 实施中）

所有命令显式指定 `--device <key>`，不跟随 GUI 当前设备。Android/iOS 不开放这些 Harmony 专用工具。下面按现有源码登记；“待实现”行尚未加入 schema，不代表当前 CLI 能调用。

| 需求 | 操作/拟定命令 | 共享源码入口 | 当前状态/验收 |
| --- | --- | --- | --- |
| AUTO-06 | `overview get` | hdc.ts getOverview | 已实现显式有界 context；本机专项通过 |
| AUTO-06 | `apps list` | hdc/bundle.ts getBundles | 已实现；本机专项通过 |
| AUTO-06 | `apps info` | hdc/bundle.ts getBundleInfos | 已实现；本机专项通过；自动化仅读设备元数据 |
| AUTO-06 | `apps top` | hdc/bundle.ts getTopBundle | 已实现；本机专项通过 |
| AUTO-06 | `processes list` | hdc/base.ts getProcesses | 已实现；本机专项通过 |
| AUTO-06/07 | `apps start/stop` | hdc/bundle.ts startBundle/stopBundle | 已实现；名称校验、exit marker 确认，本机专项通过 |
| AUTO-06/07 | `apps install` | hdc/bundle.ts installBundle | 已实现；绝对 HAP、512MiB 上限、私有暂存、取消/不确定结果专项通过 |
| AUTO-06/07 | `apps uninstall/clear-data/clear-cache` | hdc/bundle.ts 对应函数 | 已实现；确认结果，不自动重试；真机 pending |
| AUTO-06 | `layout dump` | hdc/uitest.ts dumpWindowHierarchy | 待实现；需要有界捕获与 XML 输出 |
| AUTO-06/07 | `logs capture` | hdc/hilog.ts openHilog / hdckit reader | 待实现；有限时长/大小、独立 reader、不清日志 |
| AUTO-06/07 | `ports list` | hdc/port.ts listForwards/listReverses | 待实现；明确方向 |
| AUTO-06/07 | `ports add/remove` | hdc/port.ts forward/reverse/remove | 待实现；只移除显式 local/remote 条目 |
| AUTO-06/07 | `shell run` | hdc/finiteShell.ts runFiniteShell | 待实现；单次、截止/取消、输出有界 |

未扩展：进程结束、通用文件传输、Android 新工具、iOS 控制、无 Node 分发。它们不属于本轮现有能力适配。

验收需要区分共享业务单测、真实 loopback/CLI、模拟传输以及真机。当前未发现 Harmony 设备，不能把模拟传输标记为真机通过。

M4-A 证据：[查询批次](../evidence/agent-automation/M4/2026-11-16-query/verification.json)。apps list 默认包含系统应用，`--user-only` 使用现有应用前缀过滤；apps info 使用 `--bundle` 指定一项，不进行线上名称/图标补全。apps top 沿用现有行为，仅返回非系统前台应用；无匹配时 name 为空、pid 为 0。

M4-B 证据：[应用写操作](../evidence/agent-automation/M4/2026-11-16-app-writes/verification.json)。测试只操作临时主机文件和模拟 HDC 客户端，没有安装/卸载/清理真实用户应用。
