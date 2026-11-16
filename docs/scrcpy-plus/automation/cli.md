# CLI v1 命令参考

以 `scrcpy-plus` 表示安装后的 bin；开发时替换为 `node dist/cli/index.cjs`。`schema --json` 是当前构建的机器契约，不依赖服务。

| 命令 | 参数 | 当前行为 |
| --- | --- | --- |
| `--help` | 无 | 离线帮助 |
| `schema` | 通用选项 | 离线输出已实现的服务操作 schema |
| `service start` | `--app <绝对可执行路径>`、可重复 `--app-arg <单个参数>` | 复用现有服务，或启动应用并等握手；默认 60 秒 |
| `service status` | 通用选项 | 协议、实例、应用版本和 PID |
| `doctor` | 通用选项 | 服务是否可达及版本；无服务时返回结构化错误 |
| `devices list` | 通用选项 | 设备列表、状态、能力与分平台错误；可能清理断连会话 |
| `devices capabilities` | 必需 `--device <key>` | 指定设备的状态及能力；不自动选第一台 |

通用选项：`--json`、`--profile <绝对路径>`、`--client <名称>`、`--timeout-ms <1..600000>`、`--help`。默认 client 名称为 default；名称只含 1—64 个字母、数字、下划线或连字符。普通命令默认 30000ms。未知选项、重复选项和缺少参数退出 2；仅 `--app-arg` 可以重复。

JSON 模式 stdout 只有一个结果对象；人类输出失败信息写 stderr。自动化应检查 `ok`、`error.code` 和退出码，不匹配英文错误文字。Ctrl+C 返回退出码 130 并关闭活动请求；已发往设备的写操作可能不能撤销，必须查看 outcome。CLI 不自动重发操作。

| 退出码 | 意义 |
| --- | --- |
| 0 | 命令成功 |
| 2 | 参数或协议版本错误 |
| 3 | 不支持 |
| 4 | 未找到、不可用或资源忙 |
| 5 | 未授权或本地文件权限不安全 |
| 6 | 超时 |
| 7 | 操作失败、响应无效或结果不确定 |
| 130 | 用户取消 |

## 会话、观察与输入

| 命令 | 参数 | 行为 |
| --- | --- | --- |
| `sessions start` | `--device <key>` | 复用设备后端，返回 sessionId/leaseId/state/created；不等首帧 |
| `sessions list` | 无 | 列出实例会话；停止记录保留 5 分钟 |
| `sessions get` | `--session <id>` | 查询实际状态 |
| `sessions wait` | `--session <id>`、可选 `--state <状态>` | 默认等 running；窗口存在不代表有帧 |
| `sessions leases` | 无 | 仅返回当前命名 client 的 lease |
| `sessions release` | `--lease <id>` | 按 lease 恢复清理 |
| `sessions stop` | `--session <id> --lease <id>` | 释放自己的 lease；无其他 owner 才关闭后端 |
| `screen capture` | `--session <id> --output <路径>` | 原子保存 PNG；可用 `--overwrite` 显式覆盖 |
| `input tap` | `--session <id> --frame <frameId> --x <px> --y <px>` | 截图像素坐标，自动抬起 |
| `input swipe` | 同 tap，加 `--to-x <px> --to-y <px> --duration-ms <1..10000>` | 完整手势串行执行 |
| `input scroll` | 同 tap，加 `--dx <-1..1> --dy <-1..1>` | Android 原生滚轮；Harmony 模拟滑动 |
| `input text` | `--session <id>` 加三选一：`--text <内容>`、`--text-file <UTF-8路径>`、`--text-stdin` | 不清空当前输入框；Android 使用粘贴并改变设备剪贴板 |
| `input key` | `--session <id> --key <名称>` | home/back/enter/backspace/tab/up/down/left/right/power/volume-up/volume-down |

截图可选 `--max-age-ms <0..600000>`（默认 2000）、`--allow-stale` 和 `--after-action <observationToken>`。after-action 必须取得动作后更晚的呈现序号，静止/断流会超时，allow-stale 不能绕过。token 和截图坐标引用最多有效 60 秒；尺寸或解码代际改变后须重新截图。frameId 不能证明控件位置或业务成功，需要观察新图。

Harmony scroll 使用 250ms 滑动，端点限制在画布内；正 dx/dy 为手指右/下移动，位移为画布尺寸的 delta/2。GUI 手势与自动化动作不会交错；BUSY 时等 GUI 手势结束。未确认释放会阻止后续输入，应释放会话并重新启动。iOS 为接收画面模式，不支持输入。

```sh
scrcpy-plus sessions start --device '<key>' --client agent-a --json
# 保存返回的 sessionId 和 leaseId，以下以 SID/LEASE 表示。
scrcpy-plus sessions wait --session "$SID" --client agent-a --json
scrcpy-plus screen capture --session "$SID" --output before.png --client agent-a --json
# 观察 before.png，使用返回的 frameId 和确认过的坐标。
scrcpy-plus input tap --session "$SID" --frame "$FRAME" --x 100 --y 200 --client agent-a --json
scrcpy-plus screen capture --session "$SID" --after-action "$TOKEN" --output after.png --client agent-a --json
scrcpy-plus sessions stop --session "$SID" --lease "$LEASE" --client agent-a --json
```

普通 CLI 退出保留 lease；GUI 关窗时若有 lease 则隐藏并保留 renderer，再次 GUI 打开会认领 GUI owner。输入需要当前 client 的 lease。若 start 响应丢失，先用同一 `--client` 查询 `sessions leases`，再继续或 release；不要凭另一 client 的 session ID 停止它。应用显式退出终止全实例资源。

文本上限 16384 UTF-16 code units，文件/stdin 额外有 64KiB UTF-8 输入上限。不要把敏感文本放在命令参数中。MCP 仍待 M5 实现。

## Harmony 查询

以下命令必须指定 `--device <Harmony key>`；不会跟随 GUI 的目标选择，Android/iOS 返回 UNSUPPORTED。

| 命令 | 额外参数 | 返回 |
| --- | --- | --- |
| `overview get` | 无 | 设备参数、CPU、内存、屏幕等现有概览字段 |
| `apps list` | 可选 `--user-only` | bundle 名称数组，默认包含系统应用 |
| `apps info` | `--bundle <名称>` | 单项设备元数据；不查询线上商店 |
| `apps top` | 无 | 非系统前台应用 name/pid；无匹配为空/0 |
| `processes list` | 无 | 进程快照 |

使用 `--json --timeout-ms <期限>`；取消/截止会关闭有界设备查询，不自动重试。完整工具覆盖与尚未开放的写操作见[逐操作登记](harmony-tools.md)。
