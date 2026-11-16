# Agent 自动化长任务：状态、证据与故障定位

更新时间：2026-11-16（Asia/Shanghai）。

## 当前状态

**M1/M2 已实现并完成本机验证，继续 M3 会话/截图/输入。** 当前 CLI 仅开放服务与设备发现，MCP 尚未实现。源码检查基线 `fb476c6`，工作区开始时干净。

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
| M3 | 会话、截图、输入闭环 | 未开始 | 真机/平台现场状态尚未检查 |
| M4 | 现有设备工具覆盖 | 未开始 | 需要逐操作登记矩阵 |
| M5 | Agent skill、MCP | 未开始 | 无宿主接入证据 |
| M6 | 全量回归、跨平台验收与交付 | 未开始 | 不沿用历史投屏证据冒充自动化验收 |

## 恢复与下一步

1. 阅读本页和 spec，再核对 `git status --short` 与当前 commit；保留用户改动。
2. 方向已确认，不重复询问；M1/M2 本机完成，从 M3 的会话所有权、真实就绪和帧引用测试继续。
3. 每阶段同步本页、计划 checkbox、证据和 RUNBOOK；已有 M1/M2 测试不要重新实现。
4. 真机或系统缺席时先推进契约、测试、文档和其他可做阶段，保留 pending；不把环境缺席视作已验收。
5. 若出现方向变更，先更新 spec 的决策及需求映射，再调整计划；普通修复不改变需求编号。

## 问题定位索引

以下自动化模块为规划路径，创建前以“现有入口”排查；不可把规划路径误当已存在代码。

| 症状 | 需求 | 规划入口 | 现有入口 |
| --- | --- | --- | --- |
| 服务找不到/版本不匹配/鉴权失败 | AUTO-02/07 | `src/main/automation/{server,discovery,auth}.ts`、`src/cli/client.ts` | `src/main/index.ts` |
| 设备遗漏/能力误报/目标错乱 | AUTO-01/06 | `src/common/automation/capabilities.ts`、平台 adapters | `src/main/lib/devices/index.ts`、`src/common/types.ts` |
| 会话假 running/重复连接/误停其他窗口 | AUTO-03 | `src/main/automation/sessions.ts` | `src/main/window/{nativeMirror,screencast}.ts`、`hdc/captureSessions.ts` |
| 黑图/旧图/方向错误/截图失败 | AUTO-04 | `src/main/automation/frames.ts` | `src/renderer/native-mirror/App.tsx`、`ScreencastClient.ts` |
| 点击偏移/重复输入/触点未释放 | AUTO-05/07 | `src/main/automation/input.ts` | `src/main/lib/devices/android.ts`、`hdc/screencastInput.ts` |
| 应用/日志/布局/端口操作失败 | AUTO-06 | `src/main/automation/adapters/harmonyTools.ts` | `src/main/lib/hdc/` 对应模块 |
| CLI 可用但 Agent 失败 | AUTO-08/09 | `src/mcp/index.ts`、使用 skill | 目前无 MCP 入口 |
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
