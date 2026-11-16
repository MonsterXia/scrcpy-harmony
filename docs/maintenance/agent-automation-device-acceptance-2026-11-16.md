# Agent 自动化：Harmony 清理修复与双真机验收

日期：2026-11-16；最终源码 `0eed41c`（基线 `71637b3`），分支 `codex/agent-automation`。macOS arm64、Node v22.22.3、产品 1.0.5-dev.1、API v1。代码及文档仅本地提交，未发布、推送或替换日常安装。

本轮复现并修复 Harmony 偶发清理超时；Android/Harmony 的截图、点击、滑动、UTF-8 输入和动作后观察已在真实系统设置页完成。iOS 按用户要求暂缓。完整平台验收仍未完成。[结构化证据](../scrcpy-plus/evidence/agent-automation/device/2026-11-16/verification.json)保存计数、源码分组、阶段耗时和私有记录哈希。

## AUTO-BUG-011：关闭后原生启动仍等待首帧

关联 AUTO-03/07，源自 AUTO-OBS-001 的同类真实超时复现。不能据本次复现断言此前所有超时都有相同根因；旧 M6 失败证据保持不变。

复现：Harmony 静止/息屏，投屏已经通过 JPEG 呈现，后台仍在准备或升档原生视频，此时释放最后一个 lease。预期停止启动并确认资源清理；实际 release 超过 5 秒返回 `OUTCOME_UNKNOWN`。一次追踪中，从 close 请求起 2112ms 才进入原生首帧等待，继续等待 5001ms，至 7708ms 才确认关闭。同 lease 后续 release 返回 stopped，未重新发输入或重新取得 owner。另一次基线 release 5058ms 未确认，原 lease 重试 1822ms 后停止。

根因：`CaptureScope.dispose()` 只让迟到回调失效，没有取消 `NativeVideo.start()` 的部署/首帧等待；关闭队列或 promotion 的 join 仍等待它结束。修复在 scope 失效时同步 abort，贯穿首次启动、prepared activation、后台 promotion 和 HTTP2 首帧等待；各阶段核对有效性，取消后执行原有 onEnd 及本 owner 资源清理，不再尝试下一个视频候选。保留原 5 秒清理预算和清理未确认时的 unknown 语义。

定位：`src/main/lib/hdc/captureDriver.ts`、`nativeVideo.ts`。`captureSessions.ts`/`captureTrace.ts` 提供默认关闭的 `SCRCPY_PLUS_CAPTURE_TRACE=1` 分段日志，只记录阶段、时间及数值/布尔，不输出设备标识或命令内容。持续异常时用 close.request → first-frame-wait → onEnd → cleanup-confirmed 定位；不要靠扩大预算掩盖未取消的启动。

回归：首次启动途中关闭、promotion 中关闭、静默真实 HTTP2 首帧等待取消、进入前已经 abort。修复前失败及修复后通过日志保存在私有目录；早期 fixture 缺 process 的失败另存，不当作产品缺陷证据。

## AUTO-BUG-012：首帧完成与取消的微任务竞态

独立审查确认一项 P2：首帧回调安排 abort 微任务，ready 已设为 true，但 finally 尚未移除取消监听器；取消错误地销毁成功的 HTTP2 流，调用方却得到成功结果，后续 stop 无法正常完成 onEnd。新增真实 HTTP2 回归先失败，再为 cancel 增加 ready 守卫后通过。完整测试再次通过；没有把主代理复核写成第二次独立审查。

## 真机回归与源码范围

| 构建阶段 | 场景 | 轮数 | 首次 release | 耗时 |
| --- | --- | --- | --- | --- |
| 初版取消修复，尚未加入 ready 守卫 | 静止/快速关闭与延迟关闭 | 10 | 全部 stopped | 489–845ms |
| 同上 | 留出 8 秒后台升档时间 | 3 | 全部 stopped | 114、130、875ms |
| 最终源码 0eed41c | 完整重建后快速/延迟关闭 | 4 | 全部 stopped | 884、887、552、930ms |

共 17 轮修复后计划回归全部一次清理成功，其中最终构建 4 轮；不将 17 轮全部归给最终源码，不外推为所有固件/长期稳定性。每轮等待 running、取得真实非 stale 截图后再释放。私有 cycle 脚本的 source 字段固定为基线 71637b3，不能直接作为运行源码；结构化证据按上述构建阶段纠正归属，原文件保持不改。

Android 初始 `LIBUSB_ERROR_ACCESS` 来自 SDK ADB 占有接口。核对本机现有 ADB 与目标后，只 detach 该手机，让 Plus 原生 USB 后端验证，结束后 attach 同一目标成功；未杀 ADB server，也未另启后端。首次 wait 15 秒超时后实际会话才 running，保留超时记录，没有当作立即启动通过。

双端输入在取消修复候选上完成：先查看截图，再以该 frameId 点击系统设置、滑动列表、打开搜索，使用 text-file 输入合成文字 `Scrcpy验证42`。动作后取严格更新帧，并等待稳定画面检查；两端可见文字和页面变化均确认。最后通过搜索框 X 清空临时文字并返回桌面。未改设置、安装应用或清理用户应用数据/搜索历史。**文本注入会覆盖手机剪贴板；没有读取或恢复原剪贴板。**

静止视频可能超过默认 2 秒 freshness，read-only allow-stale 仅用于观察，不用于授权输入；Harmony 从 JPEG 542×1206 升至原生 1084×2412 后，旧 frame 输入被几何检查拒绝，重新截图后继续。Android 用户静置后以 888×1920 竖屏完成输入。专用 scroll 操作、物理 180°、完整断连恢复不在本轮已通过范围。

真实双 owner：两个客户端共享 Harmony 后端、不同 lease；释放第一个后第二个仍可取得 fresh 截图，释放第二个停止；此时 Android 仍可截图，最后单独释放。两个客户端最终 lease 数均为 0。

真实端口：forward/reverse 各创建一条临时 TCP 规则，list 确认存在，仅删除本任务精确规则，list 确认消失且其他规则保留。未验证端口上的业务数据传输。专用测试 HAP 不可用，应用安装/卸载/清数据等真机写入仍 pending。

iOS 曾创建等待接收的 lease，用户随后明确要求跳过；已释放为 stopped，未将接收器存在记为 AirPlay 验收通过。

## 最终验证

| 命令/层级 | 结果 |
| --- | --- |
| npm test | 退出 0；应用 1091 项，1089 passed / 2 skipped；Licia 两模式各 606 passed / 4 pending |
| npm run lint | 退出 0，含 i18n |
| npm run build | 退出 0，桌面三部分与 CLI/MCP |
| npx tsc --noEmit --ignoreDeprecations 6.0 | 退出 2；去除源码行列偏移后诊断与上一轮基线相同，没有新增诊断；不能称全仓类型通过 |
| check-automation-electron.mjs | 退出 0；真实 Electron、明确模拟设备，9 项闭环/清理检查通过 |
| npm run check:automation-package | 退出 0；临时 tarball 安装、CLI 离线/缺服务、MCP 35 工具通过 |
| git diff --check | 通过 |

测试应用正常退出 0、discovery 删除，测试 lease 全释放，ADB 接管恢复；已重新打开原 `/Applications/Scrcpy Plus.app`，没有替换安装文件。私有截图、原始设备数据、profile 和凭据仅在忽略目录 `.superpowers/sdd/2026-11-16-agent-automation-device/`；入库记录仅保留脱敏结果及哈希。

## 后续入口

继续 Windows 的发现/ACL/路径/取消及退出、专用 Harmony HAP 写操作、物理旋转与更广的断连矩阵、实际 Codex 宿主 MCP 接入；iOS 等路线确定后再安排。通过本轮设备结果的项不重复作为阻塞，未测项不勾选完成。需求与清理契约见 [spec](../superpowers/specs/2026-11-16-agent-automation-design.md)，执行状态见 [维护记录](agent-automation.md)。
