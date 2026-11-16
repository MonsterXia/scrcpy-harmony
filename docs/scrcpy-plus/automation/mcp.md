# MCP stdio 接口

构建 `npm run build:cli` 同时生成 `dist/cli/index.cjs` 和 `dist/cli/mcp.cjs`。安装该目录的 npm 包后提供 `scrcpy-plus`、`scrcpy-plus-mcp` 两个 bin；Node 最低 22.12.0，MCP SDK 已打入包，无 Electron/USB 客户端依赖。

先运行桌面应用或显式使用 CLI 的 `service start`。MCP 不自动启动应用，访问同一绝对 profile，默认持久客户端名 `mcp`。独立 Agent 用不同 `--client`，相同名字表示同一逻辑调用者。

```sh
scrcpy-plus-mcp --profile /absolute/app-profile --client codex-device
```

stdio stdout 仅供 JSON-RPC，不能用 `npm run` 包裹该命令并把 npm banner 送入宿主。

Codex 本机 `codex mcp add --help` 已确认支持以下注册语法，将路径替换为实际绝对路径。该命令写入用户配置；本次用户要求接入后已注册并以真实宿主验证，详情见下方记录：

```sh
codex mcp add scrcpy-plus -- /absolute/node /absolute/dist/cli/mcp.cjs --profile /absolute/app-profile --client codex-device
```

其他 stdio 宿主配置同样的 command/args，例如：

```json
{"mcpServers":{"scrcpy-plus":{"command":"/absolute/node","args":["/absolute/dist/cli/mcp.cjs","--profile","/absolute/app-profile","--client","agent-device"]}}}
```

工具名将 CLI 操作中的点和连字符改为下划线；例如 `input.tap` → `input_tap`，`apps.clear-data` → `apps_clear_data`。参数与协议 schema 相同，使用 camelCase，另提供 timeoutMs（1—600000）。所有注册操作都可列出，具体平台可用性仍需 devices_capabilities；不支持能力返回错误。service.start 是显式 CLI 启动能力，不是 MCP 工具。

调用顺序：devices_list → devices_capabilities → sessions_start（取得自己的 lease）→ sessions_wait → screen_capture → input_tap（引用 frameId、截图像素）→ screen_capture（afterAction=输入结果的 observationToken）→ 检查结果 → sessions_release。截图返回 image content；有限日志/布局返回嵌入 resource blob（urn:uuid，不是可重新下载的 URL），元数据在 structuredContent/data。普通结果和错误也附带文本 JSON；isError 映射本地服务错误。

取消通知和断管传播到请求 AbortSignal；不自动重发写操作。进程退出保留持久 lease，恢复时相同 profile/client 调用 sessions_leases，再明确 release；CLI 恢复时用 `--client codex-device`。关闭 MCP 不关闭桌面或其他人的会话。

依赖依据：2026-11-16 检查 [官方 SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[v2 stdio](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html)、[低层服务](https://ts.sdk.modelcontextprotocol.io/v2/advanced/low-level-server.html)与[取消](https://ts.sdk.modelcontextprotocol.io/v2/servers/logging-progress-cancellation.html)。锁定 `@modelcontextprotocol/server` 与测试客户端 `@modelcontextprotocol/client` 2.4.0；v1 是维护线，新实现使用 v2 的 serveStdio，接受 2025 legacy 和 2026-07-28 协议。tools/list 和本地参数验证共用产品注册表；无需复制设备业务。

验证：`node --test test/automation-mcp.test.cjs` 启动真实 SDK 客户端/stdio 子进程和本地 HTTP fixture；设备响应明确模拟，不证明真机或 Codex 宿主实际调用。独立 Agent 使用 skill 位于 `.agents/skills/scrcpy-plus-automation/SKILL.md`，可复制整个目录到目标 Agent 的 skills 目录。

## 实际 Codex 宿主验收

2026-11-16，本机Codex CLI 0.169.0-alpha.11.1的app-server实际发现35工具，调用两台真机的截图和Harmony XML，并验证独占lease释放及GUI共享时只释放自己的lease。不是SDK fixture；没有模型回合或持久新聊天。当前已运行聊天的工具列表热加载未验证；配置用于后续加载该配置的宿主。

可复跑（要求已配置scrcpy-plus、对应profile的桌面服务运行；真机参数为显式选择）：

```sh
node script/check-automation-codex.mjs /absolute/new-private-report
node script/check-automation-codex.mjs /absolute/new-private-device-report both
```

输出包含私有PNG和宿主stderr，禁止整目录提交；仅脱敏verification.json可归档。已有同客户端lease时脚本拒绝继续；遇到其他应用持有USB或Harmony捕获时先协调释放，不自动停止其他owner。若服务使用源码构建，显式通过CLI service start的 `--app <Electron可执行文件> --app-arg <仓库绝对路径/dist> --profile <与MCP相同路径>` 启动。MCP不会自动启动桌面服务；旧安装版没有新自动化服务时不能只注册客户端后期待可用。

本次源码/配置边界、失败与清理见[专项记录](../../maintenance/agent-automation-android-codex-2026-11-16.md)。移除本次注册使用 `codex mcp remove scrcpy-plus`，不要整份恢复用户配置覆盖后续改动。
