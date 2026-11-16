# Agent 自动化独立审查与修复

日期：2026-11-16。用户要求“独立审查修改内容，如果有问题请修改”。独立 reviewer 使用新上下文，只读审查 `fb476c6..aa3bf70`；主代理复现、修复并验证。修复源码提交 `2e70424`，分支 `codex/agent-automation`。本轮六项确认问题已修复；没有将代码审查或模拟测试当作完整真机验收。

## 审查发现与修复

| 编号 / 来源 | 最小复现及影响 | 根因、修复入口 | 验证与边界 |
| --- | --- | --- | --- |
| AUTO-BUG-007 / 独立审查 P2 / AUTO-05、10 | GUI 遥控器方向键 2012—2015、确定 2016、应用切换 -1 均同步报 Invalid system key，命令未发送 | `hdc.ts inputKey` 共用 `screencastInput.ts sendScreencastSystemKey` 后，白名单遗漏既有 GUI 键；补回这些键，仍走有限传输和统一输入门禁，自动化命名键 schema 不扩大 | `screencast-input-main.test.cjs` 覆盖全部既有按钮、非法值及自动化占用门禁；未点击真机遥控器，-1 仅保持原有传输语义 |
| AUTO-BUG-008 / 独立审查 P2 / AUTO-06、07 | ability 名称允许 `$`，例如 Main$Ability 经设备 shell 变成 Main 或环境变量对应名称，可能启动错误 ability | `hdc/bundle.ts startBundle` 未引用参数；为 bundle/ability 使用 shell 单引号字面编码 | `bundles.test.cjs` 用真实本机 `/bin/sh` 和模拟 aa 验证 `$` 原样传递；不执行设备应用启动 |
| AUTO-BUG-009 / 主代理补充 / AUTO-07 | SDK 回调同步 abort 后抛错，即使调用者 catch，取消 Promise 未接入 race，仍触发未处理 rejection 和 Node 进程退出 | `adapters/waitForRead.ts` 先以 Promise microtask 接入 race，再检查 context 并调用 SDK | `automation-read-wait.test.cjs` 在 strict-unhandled-rejections 子进程复现退出 1，修复后退出 0；共享只读/布局测试通过 |
| AUTO-BUG-010 / 主代理补充 / AUTO-03、07 | release 等待超时、后端 close 仍在途时，start 返回新 lease，GUI 也可认领；迟到关闭会终止新调用者刚得到的会话 | `sessions.ts` 不能只看已结束的 stopping 等待，还须看在途 cleanup；start、claimGui、requireLease 在其结束前拒绝，原 release 可加入原关闭过程 | `automation-sessions.test.cjs` 覆盖超时后拒绝新 owner/操作、保留旧 lease 重试、只关闭一次及迟到确认；不声称解释了 AUTO-OBS-001 真机超时根因 |
| AUTO-FOLLOWUP-001 / 上轮 Minor / AUTO-03 | 同客户端释放后重新获取同一存活会话，旧 lease 被覆盖，重复释放返回 NOT_FOUND/UNAUTHORIZED | `sessions.ts` 增加按 leaseId 保存的已释放记录，至少保留五分钟并按原 client 验证 | 回归覆盖重获后的两种释放入口、跨 client 拒绝、新 lease 不受影响及过期 |
| AUTO-FOLLOWUP-002 / 上轮 Minor / AUTO-06、07 | 设备安装已确认后，句柄关闭或目录删除失败覆盖成功结果，甚至跳过另一清理步骤 | `installSource.ts` 各清理步骤独立 allSettled；保留安装结果/原错误，成功由 `harmonyTools.ts` 返回独立 cleanupConfirmed | 回归覆盖关闭失败仍删目录、删除失败不覆盖安装原错误和服务结果字段；没有真实安装/卸载 |

所有条目的修复提交均为 `2e70424`；旧 Minor 从“暂留”改为已修复。独立 reviewer 未参与实现，也未二次审查修复后的差异；修复验证由主代理完成。

## 失败与通过证据

完整结构化结果和日志哈希见 [verification.json](../scrcpy-plus/evidence/agent-automation/review/2026-11-16/verification.json)。本地原日志位于忽略目录 `.superpowers/sdd/2026-11-16-agent-automation-review/`。

- 旧两项问题：15 项定向中 3 项失败；修复后组合 21 项通过。
- 同步取消：strict 子进程回归先失败；修复后只读/工具组合 10 项通过。
- 独立审查两项：57 项中 2 项失败；修复后 57 项通过。
- 在途清理：12 项中 1 项失败；修复后 12 项通过。
- 最终 `npm test`：应用 1086 项，1084 passed / 2 skipped；Licia 两模式各 606 passed / 4 pending。新增八项回归，原失败记录保留。
- `npm run lint`（含 i18n）、`npm run build` 全部通过，构建包含桌面三部分和 CLI/MCP。
- 真实 Electron + 明确模拟设备：Canvas PNG、输入观察屏障、双客户端 lease、隐藏截图及最后 owner/发现文件清理等 9 项通过。
- 临时 tarball 安装、CLI 离线入口、缺服务诊断、真实 MCP stdio 35 工具通过。
- `npx tsc --noEmit --ignoreDeprecations 6.0` 退出 2，完整诊断与上轮 M6 日志逐行相同；没有新增诊断，不能称全仓类型检查通过。

## 维护与后续

[Spec](../superpowers/specs/2026-11-16-agent-automation-design.md)、[进度](agent-automation.md)、[CLI](../scrcpy-plus/automation/cli.md)、[协议](../scrcpy-plus/automation/protocol.md)、[工具说明](../scrcpy-plus/automation/harmony-tools.md) 已同步 lease 保留/清理门禁与安装清理字段。

本轮未操作真机、发布、推送、远端合入或替换日常安装。AUTO-OBS-001 偶发真机清理超时仍待复现；Harmony 完整输入/应用写入、Android USB access、iOS 实际发送端、Windows、物理 180° 和 Codex 宿主矩阵沿用[验收交接](../scrcpy-plus/automation/acceptance.md)的 pending。下一步继续这些有实际环境依赖的验收，不重开已修复的六项问题。
