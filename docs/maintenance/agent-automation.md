# Agent 自动化长任务：状态、证据与故障定位

更新时间：2026-11-16（Asia/Shanghai）。

## 当前状态

**M1/M2 本机验证完成，M3 实现及本机模拟验证完成，真机/平台验收 pending；M4/M5 本机候选完成，继续 M6。** 已实现会话 lease、真实画布截图、二进制传输、CLI 文件输出及 Android/Harmony 输入适配；已完成真实 Electron 模拟闭环，真机未验收，MCP SDK stdio 新旧协议与安装包验证通过。源码检查基线 `fb476c6`，工作区开始时干净。

- [Spec：SP-AUTO-001](../superpowers/specs/2026-11-16-agent-automation-design.md)
- [连续实施计划](../superpowers/plans/2026-11-16-agent-automation.md)
- [当前产品能力与平台限制](../scrcpy-plus/integration.md)

方向：共享服务 → CLI 观察/操作闭环 → 现有设备工具覆盖 → MCP；首期依赖桌面 Electron，允许可见投屏窗口。用户只确认这个方向，具体实现与修复自主推进。本轮本地交付，不含公开发行或替换日常安装。

## 阶段状态

| 阶段 | 交付 | 状态 | 证据/限制 |
| --- | --- | --- | --- |
| M0 | spec、计划、定位入口、独立文档审查 | 完成 | 独立审查 4 项边界已纳入；链接/需求追踪检查通过；用户已确认 |
| M1 | 契约、能力、鉴权本地服务 | 本机完成 | 协议/传输/生命周期专项、真实 Electron 服务验证；Windows 待验收 |
| M2 | CLI、启动诊断、可分发客户端 | 本机完成 | 子进程/并发启动、tarball 安装、发现链路；Windows 待验收 |
| M3 | 会话、截图、输入闭环 | 本机候选，真机 pending | 应用 1044 passed / 2 skipped；lint、三部分构建通过；真实 Electron 模拟闭环通过；Android USB claim 失败，未获得真机截图/输入证据 |
| M4 | 现有设备工具覆盖 | 四批本机候选完成；真机 pending | 已登记逐操作矩阵；概览/应用查询/进程通过 167 项相关回归及 55 项最终查询/协议专项、lint、主进程/CLI 构建；真机 pending |
| M5 | Agent skill、MCP | 本机候选完成 | 官方 SDK 2.4.0、真实 stdio 客户端、安装包通过；Codex 宿主 pending |
| M6 | 全量回归、跨平台验收与交付 | 进行中 | 不沿用历史投屏证据冒充自动化验收 |

## 恢复与下一步

1. 阅读本页和 spec，再核对 `git status --short` 与当前 commit；保留用户改动。
2. 方向已确认，不重复询问；M1/M2 本机完成，从 M4 的逐操作矩阵及共享设备查询业务继续；M3 外部环境验证仍保留。
3. 每阶段同步本页、计划 checkbox、证据和 RUNBOOK；已有 M1/M2 测试不要重新实现。
4. 真机或系统缺席时先推进契约、测试、文档和其他可做阶段，保留 pending；不把环境缺席视作已验收。
5. 若出现方向变更，先更新 spec 的决策及需求映射，再调整计划；普通修复不改变需求编号。

## 问题定位索引

M1—M5 的下列入口已创建。

| 症状 | 需求 | 规划入口 | 现有入口 |
| --- | --- | --- | --- |
| 服务找不到/版本不匹配/鉴权失败 | AUTO-02/07 | `src/main/automation/{server,discovery,auth}.ts`、`src/cli/client.ts` | `src/main/index.ts` |
| 设备遗漏/能力误报/目标错乱 | AUTO-01/06 | `src/common/automation/capabilities.ts`、平台 adapters | `src/main/lib/devices/index.ts`、`src/common/types.ts` |
| 会话假 running/重复连接/误停其他窗口 | AUTO-03 | `src/main/automation/sessions.ts` | `src/main/window/{nativeMirror,screencast}.ts`、`hdc/captureSessions.ts` |
| 黑图/旧图/方向错误/截图失败 | AUTO-04 | `src/main/automation/frames.ts` | `src/renderer/native-mirror/App.tsx`、`ScreencastClient.ts` |
| 点击偏移/重复输入/触点未释放 | AUTO-05/07 | `src/main/automation/input.ts` | `src/main/lib/devices/android.ts`、`hdc/screencastInput.ts` |
| 应用/日志/布局/端口操作失败 | AUTO-06 | `src/main/automation/adapters/harmonyTools.ts` | `src/main/lib/hdc/` 对应模块 |
| CLI 可用但 Agent 失败 | AUTO-08/09 | `src/mcp/index.ts`、使用 skill | src/mcp/index.ts |
| 开发可用但安装包失败 | AUTO-10 | `script/build-cli.mjs`、CLI package | `script/build.mjs`、`script/pack.mjs` |

## 验证证据

| 日期 | 层级 | 命令/动作 | 结果 | 不能证明的范围 |
| --- | --- | --- | --- | --- |
| 2026-11-16 | 只读源码 | 检查设备/会话/输入/画面/构建入口与 git 状态 | 完成，基线 fb476c6 | 不证明当前设备连接、运行或新功能通过 |
| 2026-11-16 | 独立设计审查 | automation_spec_review 阅读 spec 并核对可实施性 | 提出 4 项关键边界，已补充 spec/计划 | 属文档审查，不是实现或运行验收 |
| 2026-11-16 | 文档静态检查 | Python 检查本轮本地 Markdown 链接、代码围栏及 AUTO-01—10 映射；git diff --check | 首轮因计划缩写未匹配完整需求编号，补全逐项表后复查通过 | 未运行应用测试、构建或真机操作 |

M1/M2 结果见[verification.json](../scrcpy-plus/evidence/agent-automation/M1-M2/2026-11-16/verification.json)：26 项自动化专项；全量应用 991 passed / 2 skipped；Licia 两模式各 606 passed / 4 pending；lint、主进程与 CLI 构建、tarball 安装和真实 Electron 服务验证通过。真实发现 Android 与 iOS 接收器，无 provider error，正常退出清理 discovery。此前 fixture 无应用 manifest 导致版本为 Electron 45，补 manifest 后再次验证返回产品 1.0.5-dev.1；未以旧结果冒充产品版本。

原生 `tsc --noEmit` 遇配置弃用项；加 `--ignoreDeprecations 6.0` 后全仓仍有诊断，本轮新增模块无诊断，不能称为全量类型通过。Windows 和真机输入仍 pending。

实施证据存入 `docs/scrcpy-plus/evidence/agent-automation/<阶段>/<运行ID>/`。报告须包含源码身份、版本、时间、命令、退出码、结果和未测项，屏幕/原始日志/凭据不入库。

## 问题记录模板

使用 AUTO-BUG-001 起编号。每个条目保留：状态；关联需求；源码/平台；最小复现；预期/实际；发生层级；根因与代码入口；修复提交；失败及通过证据；未验证范围。失败记录不因后续成功删除。

AUTO-BUG-001（已修复）：协议 description 被 GUI 文案检查误判；机器描述拆为协议 JSON，检查器未豁免 GUI，i18n 和全量回归通过。

AUTO-BUG-002（已修复）：CLI 把 403 当作请求 ID 不匹配；HTTP 鉴权失败先转换 UNAUTHORIZED，退出码 5；新增回归 RED→GREEN。

AUTO-BUG-003（已修复）：--help 绕过未知参数检查；先校验离线帮助选项，新增回归 RED→GREEN。

AUTO-BUG-004（已修复）：--app-arg 无法传 -- 开头参数；保留明确参数边界，空格/Unicode 及同 profile 并发启动测试通过。

现有代码的假 running、窗口耦合仍是 M3 设计输入，不等同于已完成修复。

## 设计审查记录

独立审查提出四项可由执行者解决的问题：关窗但 lease 存活、动作后截图可能命中旧缓存、高帧率过早淘汰截图引用、CLI 丢失 lease 后无法清理。已分别确定：隐藏并保留 owner/renderer；输入 observationToken 和 after-action 截图条件；仅缓存已导出的 16 份截图引用；持久 client profile 与 leases/release 恢复。均已进入 M3 的回归和实现任务，不新增用户细节确认。

## 方向确认记录

2026-11-16 用户明确回复：“按此方向推进，持续完成后续实现、测试和修复，不用再确认细节，记得同步更新 spec、进度和验证记录。”随后回复 continue。方向与连续实施均已授权。

## M3 集成检查点（尚未验收）

- 新入口：`controller.ts` 统一会话/截图/输入，`runtime.ts` 连接真实窗口与平台适配器；`frameBridge.ts` 验证 sender/mainFrame/requestId，renderer `AutomationFrameSource.ts` 仅导出已绘制的 video canvas。
- `wire.ts` 使用 4 字节大端 JSON 长度 + JSON envelope + PNG 的有界响应；图像上限 32 MiB，JSON 上限 1 MiB。CLI 原子写入，默认不覆盖；`input text --text-file/--text-stdin` 避免内容出现在参数中。
- GUI 与自动化共享设备输入门禁；Harmony trusted API 使用真实注册窗口/lease，不构造 IPC sender。GUI toolbar 按键也走门禁。Harmony 最后 lease 释放等待实际捕获停止，失败保留重试义务。
- 已修复：挂起的按下请求阻碍释放、GUI 按下失败后无法抬起、队列满残留触摸预约、旧代际清理与新动作交错、Android key-down 失败漏 key-up。
- 待验证：完整回归修正后的结果、三部分构建、Electron 模拟闭环、真实设备截图/输入、Windows；物理 180° 旋转识别尚无验证，不能把 bitmap rotation=0 当作设备物理方向。

## M3 最新验证结果

[结构化证据](../scrcpy-plus/evidence/agent-automation/M3/2026-11-16/verification.json)。完整应用回归 1046 项：1044 passed、2 skipped；Licia 两模式各 606 passed/4 pending；lint、主进程/preload/renderer/CLI 构建通过。新增模块类型诊断为空，但整个仓库 tsc 仍受既有配置及代码诊断影响。

真实 Electron + **明确模拟设备**：真实 Canvas PNG、输入后新帧屏障、双客户端 lease、GUI 隐藏仍可截图、最后 owner 释放与 discovery 清理均通过。可复跑 `node script/check-automation-electron.mjs <空的证据目录>`（先 build:cli）。

真实应用发现 Android/iOS receiver，未发现 Harmony。Android 打开后端返回 `LIBUSB_ERROR_ACCESS`，没有发送输入、没有取得截图；lease 释放、正常退出、discovery 删除均通过。不能将模拟图视为真机验收。运行中发现的销毁窗口引用错误已补 RED→GREEN 测试，重新运行不再出现。

下一步 M4：逐项列出 overview/apps/processes/layout/logs/ports/shell 的现有入口、参数、取消能力和验收；先实现查询与有界传输，再逐批接入写操作。M5 MCP/M6 仍未完成。

## M4-A 查询批次

共享 `DeviceOperationContext` 显式固定 deviceKey、deadline 和 AbortSignal；`base.shell` 在有 context 时使用该请求的有限传输，GUI 原有调用保持原路径。getOverview/getBundles/getBundleInfos/getTopBundle/getProcesses 复用现有解析实现。自动化应用详情不发起线上商店请求。

[逐操作登记](../scrcpy-plus/automation/harmony-tools.md)，[本批证据](../scrcpy-plus/evidence/agent-automation/M4/2026-11-16-query/verification.json)。下一步 M4-B 应用写操作/安装的参数边界、结果确认、取消与不重试，再做布局/日志/端口/shell。M4 整阶段尚未完成。

## M4-B 应用写操作批次

已开放 apps start/stop/install/uninstall/clear-data/clear-cache。共享 bundle 业务接收显式 DeviceOperationContext；应用名/ability 校验、shell 退出标记和 HDC 安装/卸载成功消息均需通过。新增 hostCommand 仅管理本次子进程、固定 HDC endpoint/target、限制输出并传播取消；installSource 校验并私有暂存 HAP。

[结构化证据](../scrcpy-plus/evidence/agent-automation/M4/2026-11-16-app-writes/verification.json)：62 项应用/协议专项、140 项自动化与概览回归、lint、主进程/CLI 构建通过。真实 Harmony 应用读写和 Windows 取消尚未验收；没有操作真实用户应用。下一步 M4-C/D 有限日志、布局导出、端口和一次性 shell。

## M4-C/D 有限工具批次

日志/布局/端口/shell 已实现，参数、输出及取消边界见[工具登记](../scrcpy-plus/automation/harmony-tools.md)，结果见[证据](../scrcpy-plus/evidence/agent-automation/M4/2026-11-16-artifacts/verification.json)。156 项相关回归、13 项最终 CLI/布局专项、lint、主进程/CLI 构建通过。布局共享SDK仅取消等待；真实设备、Windows进程终止仍待验收。继续 M5 官方 SDK stdio 适配及 Agent 文档。

## M5 MCP 与 Agent 说明

官方 SDK server/client 2.4.0 已锁定；低层 handler 共用产品 schema/client，无第二套设备连接。真实 stdio 客户端在 2026-07-28 与 legacy 模式通过工具发现、图片/嵌入文件、参数/错误、取消传播；15 项 MCP/CLI 专项通过，临时 tarball 安装后两个 bin 可运行，含35个工具。独立 Agent 使用 skill 已做五场景 baseline→读取skill复测；由此发现的子命令帮助缺口已补回归并修复。标准 Python validator 缺 PyYAML，另用本机 YAML 解析器检查结构，不能称标准脚本通过。详见[结构化证据](../scrcpy-plus/evidence/agent-automation/M5/2026-11-16/verification.json)。接下来 M6 完整回归、构建、Electron 与整段独立审查。

## M6 独立审查与单轮修复

独立 reviewer 检查 `fb476c6..1925a3e`，结论为 0 Critical、2 Important、2 Minor；修复由主代理做 RED→GREEN，无二次同段审查。

- AUTO-BUG-005（已修复）：文字/滚动已派发后普通后端异常被转为 INTERNAL/not-started。`input.ts` 统一派发后 unknown/no-retry，保留不安全释放隔离，兼顾触摸中途/结束时取消；新增行为回归先失败后通过。
- AUTO-BUG-006（已修复）：后端新尺寸先于 renderer 呈现时，旧截图坐标被按新尺寸解释。Android 把截图尺寸传到实际输入队列，并在非释放派发前核对；Harmony 对照图像方向/比例，非释放触摸前再次查询实际尺寸并约束等待。释放动作仍尝试执行。新回归模拟队列中尺寸变化和旧画布方向，2 项先失败，随后 43 项定向通过。同尺寸 180° 仍不宣称已解决。
- AUTO-FOLLOWUP-001（Minor，暂留）：同客户端对仍存活会话释放后重新获取，会覆盖旧 lease 记录，旧 release 再试可能 NOT_FOUND/UNAUTHORIZED。新 lease 不会被误释放；恢复时先 leases，按当前归属操作。
- AUTO-FOLLOWUP-002（Minor，暂留）：已确认安装成功后，本地暂存文件清理异常可能覆盖成功结果为 unknown。当前不会自动重试；先查询应用状态，清理结果分离列为后续改进。

审查中暂不裁决的事项已由执行者明确处理：硬件/Windows/180°按实际证据保留 pending；同操作系统用户读取同 profile 会话/截图与选择 clientId 属文档定义的信任边界；HDC reader 发出 SIGKILL 但未收到 close 时保持 unknown，不声称清理成功，极少数未确认进程需后续诊断。
