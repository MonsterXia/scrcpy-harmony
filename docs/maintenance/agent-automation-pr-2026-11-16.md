# Agent 自动化 PR 交付

用户要求按项目规范提 PR，审查无问题且 CI 通过后合入。交付入口为 [PR #88](https://github.com/MonsterXia/scrcpy-harmony/pull/88)，目标 `master`，基线 `fb476c60f0e6e064c9e15bdcdd5d84e0b802ce1a`。范围为整段自动化服务、CLI、MCP、会话和输入归属、Harmony 清理及 Android USB 提示，不只包含最后一次修复。

## 门禁和验证

- master 要求最新基线及五项必需检查：`test`、`lint`、`windows-package`、`macos-package-arm64`、`macos-package-x64`；管理员同样受限。正常合入，不调整保护或跳过检查。
- `83d611f` 上重新执行 `npm test`：应用 1094 passed / 2 skipped，Licia 两种模式各 606 passed / 4 pending，退出 0；`npm run lint`（含 i18n）退出 0；差异空白检查通过。
- 新上下文独立 reviewer 审查完整 `fb476c6..83d611f`，确认两项 P2、一项 P3，均已复现修复；最后独立执行六组定向测试 55 passed，复核结论 Ready to merge（代码审查），无剩余阻塞项。Sourcery 的 skipped 状态不当作审查通过。
- 初始 head `83d611f` 的[首轮 CI](https://github.com/MonsterXia/scrcpy-harmony/actions/runs/43825045137)五项全部通过；修复后的最终 head 仍须重新跑完整门禁，不能沿用旧 head 的绿色状态。
- 构建、包安装及真实 Codex/Android/Harmony 证据沿用对应源码的[上一轮验收](agent-automation-android-codex-2026-11-16.md)，不把本轮无设备单测当作新的真机验收。

最终本机验证对应源码 `d687855`：全量1106 passed / 2 skipped，Licia各606/4；lint/i18n、完整build、独立安装CLI/MCP35工具、真实Electron模拟9项全部通过，tsc既有诊断忽略行列偏移后不变。新增三项修复本轮未重新操作真机，不改写之前的硬件证据。机器记录见[verification.json](../scrcpy-plus/evidence/agent-automation/pr/2026-11-16/verification.json)。

## 本轮确认问题

| 编号 | 触发与影响 | 修复及失败回归 |
| --- | --- | --- |
| AUTO-BUG-015（P2） | CLI/MCP 写请求发出后收到损坏、身份/版本不匹配或超限响应，误报 not-started，可能诱发重复写入 | `src/cli/client.ts` 保留诊断 code，改为 unknown/retryable=false；已验证服务错误不改。真实 loopback 七种异常均先失败，再与 CLI/MCP 既有回归合计23pass |
| AUTO-BUG-016（P3） | 合法端点名含 Forward/Reverse/Empty，导致端口方向错误或清单被抹空 | `src/main/lib/hdc/port.ts` 精确方向列与完整[Empty]；新增2项失败回归，端口组4pass |
| AUTO-BUG-017（P2） | GUI/force停止原生投屏、backend.close未完成时，新客户端仍获running lease，随后被旧清理销毁 | native stop同步stopping，controller失效帧/取消输入，sessions拒绝新lease/GUI认领；真实manager+controller整合2项先失败，相关四组43pass |

独立审查未判定的范围已逐项核对：Windows/iOS及完整硬件矩阵按既有pending保留，同尺寸180°限制按spec保留，私有截图/配置不入审查或公开证据；这些没有被默认为通过。

## 交付边界

本次授权是代码 PR 和正常门禁合入，版本保持 `1.0.5-dev.1`，不创建 tag、Release 或替换日常安装。iOS 按用户要求暂缓；Windows 真机、HAP 首次安装/升级/清空/卸载、物理旋转/更广断连/长期矩阵、当前聊天工具热加载仍按[验收交接](../scrcpy-plus/automation/acceptance.md)追踪。打包 CI 不等于 Windows 或 iOS 真机验收。

最终门禁：所有确认审查问题已关闭，推送最终候选后记录该 head 和五项 CI，再以该 head 合入；最终 head、五项 CI、合入 SHA 和链接记录在[PR 交付评论](https://github.com/MonsterXia/scrcpy-harmony/pull/88#issuecomment-6910516962)，避免在合入前将未来事件写成已完成。
