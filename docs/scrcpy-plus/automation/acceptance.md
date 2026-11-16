# 本地候选验收与维护交接

日期：2026-11-16；源码基线 `fb476c6`，最终实现/修复 `4c37ba6`，分支 `codex/agent-automation`。这是本地候选交付，整个平台矩阵尚未验收完成。发布、远端合入、日常安装替换均未执行。

## 可运行产物

- `npm run build`：桌面 `dist/main`、`dist/preload`、`dist/renderer` 与资源；未生成新的发布 DMG。
- `npm run build:cli`：`dist/cli/index.cjs`、`mcp.cjs`、独立包 manifest 与许可。安装见 [指南](README.md)。
- `npm run check:automation-package`：在临时目录打包、安装，验证离线 schema、缺服务诊断和真实 MCP stdio；自动删除临时安装。
- `node script/check-automation-electron.mjs <空目录>`：真实 Electron、模拟设备、Canvas PNG 和租约/输入闭环。
- Agent 使用 skill：`.agents/skills/scrcpy-plus-automation/SKILL.md`；维护代码入口 skill 仍是 scrcpy-harmony-project。

## 需求与证据映射

| 需求 | 实现入口 | 回归/证据 | 当前限制 |
| --- | --- | --- | --- |
| AUTO-01 | common/automation/protocol、CLI index、MCP index | protocol/cli/mcp；35个注册操作 | 新平台工具未扩展 |
| AUTO-02 | main/automation/server/auth/discovery/lifecycle/profile | server/profile/lifecycle；真实 Electron 服务/退出 | Windows ACL 实机 pending |
| AUTO-03 | sessions/controller/window hooks | sessions/native-window；双调用者/GUI owner 模拟闭环 | 同客户端旧 lease 重复释放的 Minor |
| AUTO-04 | FrameSource/frameBridge/frames/wire | frames/binary/renderer；真实 Canvas、Harmony截图 | 物理180°、锁屏下动作后新帧 pending |
| AUTO-05 | input/runtime、Android/Harmony adapters | input/adapters/plus-devices；旋转与派发错误 RED→GREEN | Android USB access；Harmony完整交互/iOS不支持 |
| AUTO-06 | harmonyTools、共享 hdc 模块 | tools/ports/shell/layout/host-command；Harmony只读工具实际通过 | 安装卸载/清数据/端口写操作真机 pending |
| AUTO-07 | context/client/server/input/hostCommand | 超时、取消、不重发、释放与大小边界回归 | 强杀后无close确认保持unknown |
| AUTO-08 | cli help/schema、automation docs、Agent skill | tarball安装、命令帮助、五场景Agent复测 | 需要Node22.12+ |
| AUTO-09 | src/mcp/index.ts、SDK2.4.0 | 真实SDK stdio新旧协议、错误/取消/图片/文件 | Codex宿主实际工具调用 pending |
| AUTO-10 | 上述整体、script/build | 全量1076pass/2skip；Licia各606pass/4pending；lint/fullbuild | 仓库既有tsc诊断、Windows/完整真机矩阵 |

[最终结构化证据](../evidence/agent-automation/M6/2026-11-16/verification.json)；此前阶段证据仍保留，不以本次局部真机结果覆盖旧失败记录。真实屏幕、原始设备日志、序列号与 token 不进入公开证据；本地私有探针记录保留在被忽略的 `.superpowers/sdd/2026-11-16-agent-automation/`，无需从对话恢复工作进度。

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

## 非阻断遗留与继续验收

- AUTO-FOLLOWUP-001：同客户端释放后重新获取仍存活会话会替换旧lease记录，旧release重试可能NOT_FOUND/UNAUTHORIZED；新的lease安全保留。后续可增加有期限的旧lease tombstone。
- AUTO-FOLLOWUP-002：已确认安装成功后，本地暂存清理异常可能遮蔽成功为unknown；不会自动重试。后续将设备结果与主机清理结果分离。
- AUTO-OBS-001：真实Harmony静止探针有一次清理未确认；独立重跑首次释放成功，尚不能宣称复现根因或真实同lease恢复已通过。
- 真机：使用已解锁的专用测试页面完成Harmony点击/滑动/文字→新帧验证，补临时HAP及端口写入清理；Android需可用USB接口；iOS需真实发送端。物理90°/180°与断连/恢复继续独立记录。
- Windows：实际ACL、空格/Unicode路径、退出和子进程取消；Codex：用户选择的配置中实际启动与调用MCP。

定位修复从 [维护记录](../../maintenance/agent-automation.md) 的 AUTO-BUG 编号及 tests 开始。回退以基线 `fb476c6` 或任务前版本在单独 checkout 构建为依据；当前分支及本地记录保留，不执行破坏性 reset。发布前必须重新确认未测矩阵与产品版本，不把开发版能力描述为全平台正式验收。
