# 本地候选验收与维护交接

日期：2026-11-16；源码基线 `fb476c6`，最新修复 `1f48fbd`，分支 `codex/agent-automation`。这是本地候选交付，整个平台矩阵尚未验收完成。发布、远端合入、日常安装替换均未执行。

## 可运行产物

- `npm run build`：桌面 `dist/main`、`dist/preload`、`dist/renderer` 与资源；未生成新的发布 DMG。
- `npm run build:cli`：`dist/cli/index.cjs`、`mcp.cjs`、独立包 manifest 与许可。安装见 [指南](README.md)。
- `npm run check:automation-package`：在临时目录打包、安装，验证离线 schema、缺服务诊断和真实 MCP stdio；自动删除临时安装。
- `node script/check-automation-electron.mjs <空目录>`：真实 Electron、模拟设备、Canvas PNG 和租约/输入闭环。
- Agent 使用 skill：`.agents/skills/scrcpy-plus-automation/SKILL.md`；维护代码时使用[项目 skill](../../../.agents/skills/scrcpy-plus-project/SKILL.md)。

## 需求与证据映射

| 需求 | 实现入口 | 回归/证据 | 当前限制 |
| --- | --- | --- | --- |
| AUTO-01 | common/automation/protocol、CLI index、MCP index | protocol/cli/mcp；35个注册操作 | 新平台工具未扩展 |
| AUTO-02 | main/automation/server/auth/discovery/lifecycle/profile | server/profile/lifecycle；真实 Electron 服务/退出 | Windows ACL 实机 pending |
| AUTO-03 | sessions/controller/window hooks | sessions/native-window；双调用者/GUI owner 模拟闭环 | 在途清理拒绝新 owner；真机同类超时已修复，17轮清理通过（最终构建4轮） |
| AUTO-04 | FrameSource/frameBridge/frames/wire | frames/binary/renderer；真实 Canvas、Android/Harmony截图及动作后观察 | 物理180°、锁屏下动作后新帧 pending |
| AUTO-05 | input/runtime、Android/Harmony adapters | input/adapters/plus-devices；旋转与派发错误 RED→GREEN | Android/Harmony点击/滑动/文字真机通过；专用scroll/完整旋转待补，iOS不支持控制 |
| AUTO-06 | harmonyTools、共享 hdc 模块 | tools/ports/shell/layout/host-command；Harmony只读工具实际通过 | 端口规则、HAP同版本覆盖/启动/停止通过；首次/升级/卸载/清空pending |
| AUTO-07 | context/client/server/input/hostCommand | 超时、取消、不重发、释放与大小边界回归 | 强杀后无close确认保持unknown |
| AUTO-08 | cli help/schema、automation docs、Agent skill | tarball安装、命令帮助、五场景Agent复测 | 需要Node22.12+ |
| AUTO-09 | src/mcp/index.ts、SDK2.4.0 | 真实SDK stdio新旧协议、错误/取消/图片/文件 | 本机Codex app-server35工具/双端PNG/XML/租约通过；当前聊天热加载未验证 |
| AUTO-10 | 上述整体、script/build | 全量1094pass/2skip；Licia各606pass/4pending；lint/fullbuild | 仓库既有tsc诊断、Windows/完整真机矩阵 |

[最新Codex/安卓证据](../evidence/agent-automation/codex/2026-11-16/verification.json)、[此前真机修复证据](../evidence/agent-automation/device/2026-11-16/verification.json)、[此前审查修复证据](../evidence/agent-automation/review/2026-11-16/verification.json)与[M6原始证据](../evidence/agent-automation/M6/2026-11-16/verification.json)；此前阶段证据仍保留，不以本次局部真机结果覆盖旧失败记录。真实屏幕、原始设备日志、序列号与 token 不进入公开证据；本地私有探针记录保留在被忽略的 `.superpowers/sdd/2026-11-16-agent-automation/`，无需从对话恢复工作进度。

## 执行决策及代价

以下保留执行 ledger 的全部 Ruling，方便问题定位：

1. 复用干净的 codex/agent-automation checkout，避免复制依赖；代价是不能并行改写相同构建产物。
2. 计划沿用 M0—M6，不改为 Task N；进度由维护文档/ledger记录，skill的数字任务脚本不作为状态来源。
3. 发现某平台失败时，缺失设备返回UNAVAILABLE；代价是不能据部分结果断言设备不存在。
4. M1/M2一起提交已验证的服务/客户端链路；代价是回退粒度为组合提交。
5. rotation表示已导出位图的额外变换；设备同尺寸180°识别仍需验收，不能凭rotation=0判定物理朝向。
6. Harmony scroll用250ms有界手指滑动模拟；效果与原生滚轮不同，方向/幅度见CLI文档。
7. apps list默认含系统应用，user-only沿用GUI前缀过滤；apps top只返回非系统前台应用，无匹配为空，不是全平台顶层窗口枚举。
8. 日志默认期限70秒、文件≤1MiB、空日志合法；布局取消只结束SDK等待并阻止后续阶段，在途共享读取可能迟到，不停止GUI UITest。
9. MCP退出保留持久lease，调用者用独立client并显式release；代价是异常退出后须恢复清理。文件用嵌入blob交付，URI不能重新下载。
10. 硬件/Windows/180°未由独立代码审查判定通过；按运行证据继续保留pending，候选不等于全矩阵验收。
11. 同OS用户为服务信任边界；clientId仅管理归属，同一账号下不能当安全隔离。
12. HDC子进程强杀但无close确认时保持unknown并结束有界等待；不声称清理成功，极少数情况仍需进程诊断。

## 审查修复与继续验收

本轮另修复遥控器键白名单、ability shell 展开、同步取消未处理 rejection、在途清理的新 owner 竞态。六项问题的复现和修复验证见[独立审查记录](../../maintenance/agent-automation-review-2026-11-16.md)。

- AUTO-FOLLOWUP-001 已修复：已释放 lease 按 ID 保留至少五分钟，同客户端重获后旧 release 仍幂等，新 lease 保持有效。
- AUTO-FOLLOWUP-002 已修复：已确认安装返回 completed:true 和独立 cleanupConfirmed；清理异常不覆盖设备结果，不触发重装。
- AUTO-OBS-001 后续：同类超时已复现为 AUTO-BUG-011，并确认同lease恢复。关闭取消native startup/promotion，保留5秒预算；另修复独立审查的ready/abort竞态 AUTO-BUG-012。详见[本轮报告](../../maintenance/agent-automation-device-acceptance-2026-11-16.md)；不能断言所有历史超时均同根因。
- 真机：Android/Harmony系统设置页点击/滑动/UTF-8文字→新帧及双owner隔离通过；临时forward/reverse规则增删通过。HAP同版本覆盖/启动/停止已补；首次/升级/清空卸载、专用scroll、物理90°/180°与完整断连/恢复待补。iOS按用户要求暂缓。文字注入覆盖手机剪贴板，测试输入已从搜索框清除，原剪贴板未读取或恢复。
- Windows：实际ACL、空格/Unicode路径、退出和子进程取消。Codex本机配置/app-server已验收，参见[宿主与安卓记录](../../maintenance/agent-automation-android-codex-2026-11-16.md)；当前聊天热加载另记未验证。源码构建双端GUI保留运行，MCP lease=0，日常版按用户授权退出，安装文件未替换。

定位修复从 [维护记录](../../maintenance/agent-automation.md) 的 AUTO-BUG 编号及 tests 开始。回退以基线 `fb476c6` 或任务前版本在单独 checkout 构建为依据；当前分支及本地记录保留，不执行破坏性 reset。发布前必须重新确认未测矩阵与产品版本，不把开发版能力描述为全平台正式验收。
