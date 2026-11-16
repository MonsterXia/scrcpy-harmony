# 自动化问题定位

先保存 CLI 版本、协议版本、命令（脱敏）、退出码、error.code/outcome、主机系统和相关需求号。不要附 discovery.json、token、手机序列号、原始截图或输入文字。完整进度和 AUTO-BUG 编号见[维护记录](../../maintenance/agent-automation.md)。

| 症状 | 检查/恢复 | 代码/测试 |
| --- | --- | --- |
| UNAVAILABLE | 核对 --profile；应用必须包含新自动化服务；使用显式 service start | client.ts、discovery.ts；automation-cli |
| VERSION_MISMATCH | 对齐应用和 CLI 构建，schema 查看协议版本 | protocol.ts、client.ts |
| UNAUTHORIZED | 核对目录属主/权限，退出并重启对应 profile 的应用以刷新凭据；不要将 token 粘贴到命令行 | auth.ts、discovery.ts；automation-server |
| BUSY | 同 profile 已有实例或锁身份无法确认；先确认原实例状态，正常退出；不要批量杀设备工具 | discovery.ts、Electron 单实例启动 |
| 设备为空 | 查看 devices.list.errors；平台发现失败不等于没有设备；检查系统驱动/手机授权 | devices/index.ts、service.ts |
| not-implemented | 当前阶段未开放此能力；查看能力矩阵，不能靠换参数绕过 | capabilities.ts |
| TIMEOUT/OUTCOME_UNKNOWN | 先查询状态，不重发可能已执行的写操作；增加超时前确认设备授权与连接 | server.ts、client.ts |
| 启动超时 | --app 必须是可执行文件；开发 Electron 需 --app-arg 入口；核对资源构建 | cli/start.ts；automation-cli |
| Windows ACL 失败 | 服务不会降级为开放权限；保存错误码和系统版本，待 Windows 专项复核 | discovery.ts；Windows 验收 pending |

当前测试与构建命令：`node --test test/automation-*.test.cjs`、`npm run build:cli`、`npm run build:main`、`npm test`、`npm run lint`。全仓 TypeScript 目前存在继承诊断；不能将 Vite 成功当作严格类型检查全部通过。

## M3 会话与图像

- `sessions wait` 返回 UNAVAILABLE：先 get 查看 error/disconnected；窗口存在不等于有帧。当前 Android 实机尝试出现 LIBUSB_ERROR_ACCESS，需解决 USB 访问后再验收；不要自动终止其他占用设备的程序。
- 响应丢失：使用原 `--client` 的 sessions leases 恢复 lease，再 release。
- 坐标引用失败：重新 capture，使用新 frameId。物理同尺寸180°方向检测尚未验收。
- after-action 超时：未收到严格更新的呈现帧；不代表动作没发生，不要盲目重发写操作。
- GUI 关窗后窗口未销毁：仍有 CLI lease 时属于预期，release 最后 owner 后才关闭。
- OUTCOME_UNKNOWN 或释放失败：保留原 lease 重试清理；不会自动重复输入。

Harmony 静止/息屏时的一类清理超时已定位：原生启动/升档等待首帧未随关闭取消。当前会及时取消该等待并继续确认回收；其他传输或设备故障仍可能返回 unknown。隔离复现可用 `SCRCPY_PLUS_CAPTURE_TRACE=1` 启动测试应用，比较 close.request、close.queue-enter、native.first-frame-wait、native.onEnd-ended 与 cleanup/close.confirmed；不把 onEnd 等待结束当成设备已停。详见[真机验收记录](../../maintenance/agent-automation-device-acceptance-2026-11-16.md)。

Android LIBUSB_ERROR_ACCESS 也可能是其他 ADB server 已持有 USB 接口。本轮通过已有 SDK 的 `adb -s <明确序列号> detach` 仅释放测试手机，Plus 成功投屏；清理 Plus 会话后用同一设备的 attach 恢复原状态。应先核对实际工具 help/transport 和归属，不批量结束 ADB 服务，不把本机处理方法当成所有系统的通用修复。

真实 Electron 模拟验收脚本为 `script/check-automation-electron.mjs`；它不连接真实设备，产物明确标注 SIMULATED。

输入返回 outcome=unknown 时先观察，不重放文字或手势。旋转后的新后端尺寸与旧截图不匹配时输入会失败，重新截图后再选择坐标；Android 在实际设备输入队列检查，Harmony 检查显示方向/比例并在非释放触摸前重新读取尺寸。Harmony 的尺寸读取与触摸 API 不提供设备侧原子快照，同尺寸物理180°仍待验收。

恢复边界：已释放 lease 至少保留五分钟，同客户端重获后重复释放旧 ID 不影响新 lease；过期后使用 sessions leases 查询当前归属。关闭仍在途时拒绝新 owner，原 lease 可重试清理。安装若结果 unknown，先 apps info 确认；已确认安装的本地清理失败现在单独返回 cleanupConfirmed:false，不据此重新安装。AUTO-FOLLOWUP-001/002 已修复，完整问题及回归见[独立审查记录](../../maintenance/agent-automation-review-2026-11-16.md)。

安卓ACCESS/BUSY现在通过固定USB访问原因显示双语提示；ACCESS也可能是权限拒绝，不能仅凭代码断言占用者。ADB与Plus原生USB不能同时占有该接口。若恢复用户使用Plus，不要在结束时又attach回ADB；后续重连/其他工具可能重新接管，须重新核对目标。实例与MCP应使用同一profile；多个桌面应用同时投屏还可能触发Harmony外部owner保护。最新[安卓恢复/Codex宿主记录](../../maintenance/agent-automation-android-codex-2026-11-16.md)保留两种冲突及恢复证据。

释放后出现 `Object has been destroyed` 且堆栈指向窗口防抖保存时，核对共享window.ts是否包含延迟位置保存和ready显示前的isDestroyed检查（AUTO-BUG-014）；正常视频清理成功不等于所有迟到窗口回调均安全。
