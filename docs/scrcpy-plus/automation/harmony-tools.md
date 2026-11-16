# Harmony 工具逐操作登记（M4 本机候选）

所有命令显式指定 `--device <key>`，不跟随 GUI 当前设备。Android/iOS 不开放这些 Harmony 专用工具。下面逐项登记已实现的命令与验证层级。

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
| AUTO-06 | `layout dump` | hdc/uitest.ts dumpWindowHierarchy | 已实现；有界 XML、等待取消专项通过 |
| AUTO-06/07 | `logs capture` | hdc/hilog.ts captureHilog / hostCommand | 已实现；有限时长/大小、独立 reader 专项通过 |
| AUTO-06/07 | `ports list` | hdc/port.ts listForwards/listReverses | 已实现；明确方向、列表解析专项通过 |
| AUTO-06/07 | `ports add/remove` | hdc/port.ts forward/reverse/remove | 已实现；仅显式条目、参数边界专项通过 |
| AUTO-06/07 | `shell run` | hdc/finiteShell.ts runFiniteShell | 已实现；退出码、截止/取消、输出截断专项通过 |

未扩展：进程结束、通用文件传输、Android 新工具、iOS 控制、无 Node 分发。它们不属于本轮现有能力适配。

验收需要区分共享业务单测、真实 loopback/CLI、模拟传输以及真机。早期批次未发现Harmony；M6新增实际设备只读验证，见[验收交接](acceptance.md)。应用/端口写入仍不以模拟传输标记为真机通过。

M4-A 证据：[查询批次](../evidence/agent-automation/M4/2026-11-16-query/verification.json)。apps list 默认包含系统应用，`--user-only` 使用现有应用前缀过滤；apps info 使用 `--bundle` 指定一项，不进行线上名称/图标补全。apps top 沿用现有行为，仅返回非系统前台应用；无匹配时 name 为空、pid 为 0。

M4-B 证据：[应用写操作](../evidence/agent-automation/M4/2026-11-16-app-writes/verification.json)。测试只操作临时主机文件和模拟 HDC 客户端，没有安装/卸载/清理真实用户应用。

M4-C/D：`layout dump --output <file>` 输出最多 1 MiB 的 XML；属性转义、不修改原树，深度 128/节点 20000 上限。SDK 读取受截止/取消等待保护；已经在途的共享 UITest 初始化/读取可能迟到结束，不会继续下一阶段，也不会停止 GUI 所持有的 UITest。

`logs capture --duration-ms 5000 --max-bytes 1048576 --output <file>` 使用独立有限 HDC reader，时长 1—60000ms、输出最多 1MiB，默认请求期限 70000ms。到时终止自己的 reader；达到大小上限返回 `truncated=true`；空日志合法。取消/期限不足返回错误，不清除设备日志、不操作 GUI reader。所有文件在调用端原子写入，默认拒绝覆盖，`--overwrite` 明确覆盖。

`ports list/add/remove --direction forward|reverse` 必须指定方向，add/remove 还需 `--local <node> --remote <node>`。local 始终表示主机端，remote 表示设备端；只删除明确条目，没有 remove-all。

`shell run --command <script>` 或 `--command-file <file>` / `--command-stdin` 运行一次设备 shell。脚本最多 65536 个字符，文件/stdin 最多 64KiB UTF-8；`--max-bytes` 为 1—131072，默认 128KiB。返回 `{output,exitCode,truncated}`；CLI 退出 0 表示取得结果，设备脚本失败要检查 `data.exitCode`。超时/断连时不能推断设备副作用已撤销，不自动重发。

本批证据：[日志/布局/端口/shell](../evidence/agent-automation/M4/2026-11-16-artifacts/verification.json)。该批当时仅本机与模拟HDC；M6补充实际Harmony有限日志/布局/端口列表/只读shell通过，写操作及完整交互仍pending。
