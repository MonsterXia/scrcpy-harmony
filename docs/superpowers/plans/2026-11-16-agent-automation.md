# Scrcpy Plus Agent Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户只确认一次大方向；采用主代理连续实施，常规细节不另设审批。

**Goal:** 交付共享控制服务、CLI 自动化闭环、现有设备工具适配、文档和 MCP 接口，使 Agent 可可靠观察、操作与验证设备。

**Architecture:** Electron 主进程持有设备连接和会话服务，GUI IPC、CLI 和 MCP 共用业务实现。CLI/MCP 通过同 profile 的鉴权 loopback 服务访问，不自行连接 USB。首期允许可见投屏窗口，后续扩展不复制平台业务。

**Tech Stack:** TypeScript、Electron、Node >=22.12.0、现有 HDC/Tango/AirPlay 后端、node:test；MCP SDK server/client 2.4.0，M5按官方规范锁定。

**Spec:** [SP-AUTO-001](../specs/2026-11-16-agent-automation-design.md)

**Status:** M0 已完成，用户已确认方向；M1/M2 本机验证完成，M3 实现/模拟闭环通过但真机/Windows pending，M4 本机候选完成，M5 本机候选完成，M6 本机回归/构建/审查修复完成，完整真机与Windows矩阵待验收；具体阶段状态以[维护记录](../../maintenance/agent-automation.md)为准。

## Global Constraints

- Node 客户端最低版本沿用 `>=22.12.0`；apiVersion 为 1。
- 不启动外部 adb/scrcpy/UxPlay；GUI 继续复用当前设备连接，保留 sender/mainFrame 校验。
- 普通请求默认 30 秒；服务启动/会话等待默认 60 秒；安装默认 120 秒；timeoutMs 为 1—600000；清理额外最多 5 秒。
- JSON 请求上限 1 MiB；截图二进制上限 32 MiB；截图默认 maxAgeMs=2000。
- 帧几何每会话最多 16 份、最多 60 秒；文字最多 16384 个 UTF-16 code units；停止 tombstone 至少 5 分钟。
- 退出码固定为 0/2/3/4/5/6/7/130，语义严格按 spec；输入和非幂等动作不自动重试。
- 新用户文档入口同步英文/中文 README；可见 UI 文案遵守现有 i18n；不扩大到主题重做。
- 不在同一 checkout 并行执行会改写产物的 build/test/dev；未验收事项保留 pending。
- 本地实现、构建、验证和修复自主推进；发布、远端合入、日常安装替换不作为本轮阶段动作。

## Review Focus

- 服务重启/旧 discovery/同 profile 并发启动：不能连到别的实例或泄露 token（M1/M2）。
- GUI 和两个客户端同时持有同设备：退出一个不能误停他人会话，触点不能交错（M3）。
- 静止画面、旋转、renderer 崩溃：不返回占位截图或用旧几何点击（M3）。
- 请求已发出但响应丢失：不自动重复文字、手势、安装或卸载（M2/M4）。
- Windows 空格路径、Unicode、无 Node/无设备/未授权：诊断明确且无未经请求的第二个后端（M2/M6）。

## 长任务执行规则

每阶段依次执行：读本阶段入口 → 写行为回归并确认失败 → 最小实现 → 定向验证 → 修复 → 文档/证据更新 → 本地提交。每次提交只包含本任务文件，不移动用户其他改动。阶段之间无需等用户确认；遇到真实环境限制先记录并推进其他可做任务。恢复工作时先读维护记录的“当前状态/下一步”，核对 git status 和源码身份，再从未完成项继续。

每个阶段的证据根目录为 `docs/scrcpy-plus/evidence/agent-automation/<M编号>/<运行ID>/`。实现时新增目录，禁止预先写成功结果。单测与运行验收分开。以下拟新增文件名可由执行者按职责调整，但必须同步本计划的定位表。

## 需求追踪

| 需求 | 负责阶段 | 主要验证入口（实施时创建） |
| --- | --- | --- |
| AUTO-01 | M1/M2 | automation-protocol、automation-cli |
| AUTO-02 | M1/M2 | automation-server、automation-cli |
| AUTO-03 | M3 | automation-sessions、check-automation-electron |
| AUTO-04 | M3 | automation-frames、真机观察 |
| AUTO-05 | M3 | automation-input、真机操作 |
| AUTO-06 | M4 | automation-tools、逐操作矩阵 |
| AUTO-07 | M1—M4 | protocol/server/cli/sessions/input/tools 错误与取消回归 |
| AUTO-08 | M2/M4/M5 | help/schema、安装冒烟、文档示例 |
| AUTO-09 | M5 | automation-mcp、宿主接入 |
| AUTO-10 | M6 | 应用回归、构建、Electron、设备/主机矩阵 |

## M0：设计与可恢复任务入口（AUTO-01—10）

**Files:** 本计划、对应 spec、`docs/maintenance/agent-automation.md`、`RUNBOOK.md`、`docs/maintenance/SOURCES.md`。

- [x] 完成源码盘点、spec、阶段计划和维护入口，所有实现状态保持未开始。
- [x] 按 brainstorming builder check 独立审查 spec，普通技术问题自行补齐。
- [x] 检查相对链接、路径和 `git diff --check`；记录文档验证范围。
- [x] 只确认“共享服务 + CLI 优先 + 核心闭环 + 设备工具 + MCP”一次大方向，收到后更新状态并进入 M1。

## M1：契约、能力和本地服务（AUTO-01/02/07）

**Create:** `src/common/automation/{protocol,capabilities}.ts`、`src/main/automation/{service,server,discovery,auth}.ts`、`test/automation-{protocol,server}.test.cjs`、`docs/scrcpy-plus/automation/{protocol,capabilities}.md`。

**Modify:** `src/main/index.ts`、`src/main/lib/devices/index.ts`、必要的 `src/common/types.ts`。

**Interfaces:** protocol 定义 `AutomationRequest`、`AutomationResult`、`AutomationContext`（clientId、deadline、AbortSignal）、`AutomationDevice` 和各操作 discriminated union，字段遵守 spec。导出 `dispatch(request: AutomationRequest, context: AutomationContext): Promise<AutomationResult>`。服务模块导出 `startAutomationServer(options): Promise<{ endpoint: string; close(): Promise<void> }>`，options 类型在 server 同文件导出，持有 profilePath、instanceId 和 dispatch。能力定义以同一 schema 驱动服务校验和文档。

- [x] 写 protocol 测试：未知操作、NaN/越界/冲突参数失败；成功/错误互斥；错误到退出码映射；supported 与 available 分离；单平台发现失败不抹除其他设备。
- [x] 运行 `node --test test/automation-protocol.test.cjs`，确认测试因缺失目标行为失败。
- [x] 实现类型/运行时校验、结构化发现结果及操作注册表，不开放任意 IPC 调用。
- [x] 写真实 loopback server 测试：无 token/错误 token/Origin/Host 被拒绝；超大请求中止；过期 discovery 不被信任；绑定非 loopback 被拒绝；启动失败清理；退出后 endpoint 不可用。
- [x] 运行 `node --test test/automation-server.test.cjs` 确认失败，然后实现 server/auth/discovery 和应用启停接线。
- [x] 重跑两项测试及 `npm run build:main`；产出协议文档、能力清单初稿及证据，提交 `feat: add automation service contract and local transport`。

## M2：CLI 入口与可分发客户端（AUTO-01/02/07/08）

**Create:** `src/cli/{index,client,output}.ts`、`script/build-cli.mjs`、`test/automation-cli.test.cjs`、`docs/scrcpy-plus/automation/{README,cli,troubleshooting}.md`。

**Modify:** `package.json`、必要的 `package-lock.json`、`script/build.mjs`、中英文 README。

**Interfaces:** `runCli(argv: string[], io: CliIo): Promise<number>`，CliIo 包含 stdout/stderr 写入和可取消 signal；`callAutomation(request: AutomationRequest, options: ClientOptions): Promise<AutomationResult>`，ClientOptions 包含 profilePath、deadline、signal。客户端不 import Electron/native USB；构建生成独立 Node bin 与其 package.json。

- [x] 写 CLI 子进程测试：`--help`/`schema --json` 离线可用；非法参数退出 2；服务缺失退出 4；stdout JSON 可解析且 stderr 日志不混入；协议冲突退出 2。
- [x] 运行 `node --test test/automation-cli.test.cjs` 确认失败；实现 parser、输出和 client，覆盖 profile 参数及显式应用路径。
- [x] 实现 `service start/status`、`doctor`、`devices list/capabilities`；service start 复用已有实例并等待实际握手，不依赖 inspector。
- [x] 补真实子进程测试：带空格/Unicode 的应用路径；超时退出 6；Ctrl+C 退出 130；响应丢失不重发写操作；同 profile 同时启动只产生一个服务。
- [x] 构建 CLI，在临时目录安装生成包并执行 help/schema/doctor；记录无 Node 前提、开发运行和本地包安装命令。重跑定向测试，提交 `feat: expose automation CLI and diagnostics`。

## M3：会话、截图与输入闭环（AUTO-03/04/05/07/10）

**Create:** `src/main/automation/{sessions,frames,input,controller,runtime,sessionOperations,frameBridge,windowHooks}.ts`、`src/common/automation/{frames,wire}.ts`、`src/renderer/lib/AutomationFrameSource.ts`、`src/cli/files.ts`、`src/main/automation/adapters/{android,harmony}.ts`（iOS 在 controller 中显式 view-only）、`test/automation-{sessions,frames,input}.test.cjs`、`script/check-automation-electron.mjs`。

**Modify:** `src/main/window/{nativeMirror,screencast}.ts`、`src/main/lib/hdc/{captureSessions,screencastInput}.ts`、`src/renderer/native-mirror/App.tsx`、`src/renderer/screencast/lib/ScreencastClient.ts`、`src/preload/` 对应桥接、协议与 CLI 命令注册。

**Interfaces:** `startSession(deviceKey, context): Promise<{sessionId,leaseId,state,created}>`；`releaseSession(sessionId,leaseId,context): Promise<AutomationResult>`；`captureFrame(sessionId,options,context): Promise<CapturedFrame>`；`performInput(sessionId,action,context): Promise<AutomationResult>`。在 protocol 定义参数类型，CapturedFrame 含 spec 元数据及受限二进制；文件输出由 CLI 写入。平台适配器实现统一生命周期和输入接口，保留平台不同的就绪条件。

- [x] 写 sessions 回归：鸿蒙窗口存在但无首帧不是 running；重复 start 复用后端；两 lease + GUI owner 隔离；非法释放拒绝；旧实例会话失效；停止 tombstone；断连/取消/异常清理；start 响应丢失后通过持久 clientId 查询并释放 lease。
- [x] 运行 `node --test test/automation-sessions.test.cjs` 确认失败，抽取会话业务和 lease 管理；GUI 接入同一生命周期，保留 IPC owner 检查；实现 client profile、sessions leases/release。仍有 CLI lease 时关窗只隐藏并释放 GUI owner，重开显示同 renderer；最后 owner 释放才销毁，显式退出清理全部。
- [x] 写 frames 回归：无帧、默认超过 2000ms、renderer 崩溃、32 MiB 上限失败；allow-stale 显式标记；frameId/时间/尺寸真实；输出文件默认不覆盖、失败不留下伪成功文件；after-action 不返回旧序号、静止时超时且不能用 allow-stale 绕过；高帧率不淘汰最近 16 个已导出截图引用。
- [x] 运行 `node --test test/automation-frames.test.cjs` 确认失败，建立专用截图桥接、二进制读取和原子文件输出。
- [x] 写 input 回归：截图像素→实际设备坐标；过期帧或旋转 revision 拒绝；每设备完整手势串行；两个设备互不阻塞；取消/断连发出释放；未确认释放禁止后续动作；iOS 控制退出 3。
- [x] 运行 `node --test test/automation-input.test.cjs` 确认失败，实现 tap/swipe/scroll/text/key 及 CLI；成功输入签发 60 秒有效的 observationToken，接入截图 after-action；文本从 stdin/file 读取选项避免敏感文字出现在进程参数中。
- [x] 重跑上述专项与现有 `plus-devices`、`capture-sessions`、`screencast-input-main` 等受影响回归，执行三部分构建。
- [ ] 使用真实 Electron + 明确标注的模拟设备验证完整 CLI 流程、owner 隔离和关窗恢复；随后对可用 Android/Harmony 真机做截图→安全测试页面输入→截图闭环，iOS 验证等待/接收/不支持控制。缺设备只记录 pending，继续 M4。
- [x] 更新 CLI/协议/集成说明/架构参考和证据，提交 `feat: complete device observation and input workflow`。


M3 真机验收保留未勾选：模拟 Electron 部分已通过；Android USB claim 失败，Harmony/iOS 实接收及 Windows 尚未验证。不会据此标记总任务完成。

## M4：现有设备工具覆盖（AUTO-06/07/08）

**Create:** `src/main/automation/adapters/harmonyTools.ts`、`test/automation-tools.test.cjs`。

**Modify:** `src/main/lib/hdc/{base,bundle,shell,port,uitest,hilog}.ts`、`src/main/lib/hdc.ts`、CLI/协议注册和能力矩阵。

**Interfaces:** 通过 M1 注册表为具体操作提供 schema 和 handler；业务函数显式接收 deviceKey/context，GUI IPC 复用同一函数。命令名称、输入和结果 schema 逐项写入 protocol/cli 文档后再实现。

- [x] 完成 spec 5.1 的逐操作盘点矩阵；每行包含需求号、源码入口、平台、命令、支持/延期原因和验收证据，不以百分比替代覆盖清单。
- [x] 以“概览/查询”“应用读写”“日志/布局”“端口/shell”四个可独立验证的小批次实施；每批先写失败回归，运行 `node --test test/automation-tools.test.cjs`，再提取业务和添加命令。
- [x] 回归明确覆盖：无设备/未授权/不支持；目标切换不重定向操作；shell 超时中止及有界输出；日志取消；安装失败与结果不确定；卸载/清数据不自动重试；文件路径不进入 shell 拼接；端口只删除显式条目。
- [x] 每批专项通过后更新能力矩阵/help/schema；真实修改验证仅用本任务临时测试应用/文件/端口，记录清理；不卸载或清理用户真实应用数据。
- [x] 四批完成后执行受影响 HDC 回归、lint 和主进程构建，更新证据和定位表，按批提交 `feat: expose Harmony device tools to automation`。

## M5：Agent 文档与 MCP（AUTO-08/09）

**Create:** `src/mcp/index.ts`、`test/automation-mcp.test.cjs`、`.agents/skills/scrcpy-plus-automation/SKILL.md`。

**Modify:** CLI 构建/包配置、依赖锁文件、用户文档和能力矩阵。

**Interfaces:** MCP adapter 使用 `callAutomation` 和同一操作 schema；tools/list、tools/call 及图像/文件结果由正式 SDK 提供，stdout 只承载 stdio 协议。

- [x] 读取当前官方 MCP/目标 Agent 接入规范，记录选用 SDK 的版本/来源；新增依赖同时更新锁文件。
- [x] 写真实 stdio 协议测试：初始化、工具发现、schema 参数验证、调用服务、图片返回、错误映射、取消和 stdout 无日志污染；不支持平台不得静默成功。
- [x] 运行 `node --test test/automation-mcp.test.cjs` 确认失败，实现薄适配和本地启动入口；工具副作用标注与 M4 矩阵一致。
- [x] 撰写独立使用 skill、CLI/MCP 安装配置、闭环示例、退出/恢复步骤；不把源码维护 skill 当最终用户说明。
- [x] 通过真实 MCP 客户端完成协议闭环；有可用 Codex 配置时另记实际接入证据，无配置不冒充宿主已验收。重跑专项并提交 `feat: add MCP adapter and agent workflow documentation`。

## M6：完整回归与交付（AUTO-10，复核全部需求）

**Modify:** 各实现/文档中的确认缺陷、`docs/maintenance/agent-automation.md`、RUNBOOK、集成说明、构建指南、证据目录。

- [x] 顺序执行 `npm test`、`npm run lint`、`npm run build`；核对 TypeScript 实际可用检查和基线，新改动诊断须修复。环境失败保留命令和原因，不写 passed。
- [x] 执行 CLI 安装冒烟、真实 Electron 闭环、MCP stdio、双设备/双调用者、服务重启/旧 lease、超时/断连/取消；重新确认所有权和清理结果。
- [ ] 在可用 macOS/Windows 环境分别验证客户端、服务和退出；缺平台明确 pending。真机证据不得沿用旧投屏测试作为新 CLI 验收。
- [x] 做整段变更审查，修复确认问题并仅重跑受影响验证；将每个 AUTO-01—10 映射到实现、测试、证据和限制。
- [x] 校对命令参考/schema/skill/README，记录最终源码身份、构建产物位置、回退方式、未测矩阵与下一步。
- [ ] 仅在 spec 完成标准满足时把总任务标为验收完成；否则准确交付候选并继续处理可解决项。提交 `docs: record automation acceptance and maintenance handoff`。

M6 本地候选交付见[验收与交接](../../scrcpy-plus/automation/acceptance.md)。全矩阵未满足的两项保持未勾选，不冒充任务已完全验收。
