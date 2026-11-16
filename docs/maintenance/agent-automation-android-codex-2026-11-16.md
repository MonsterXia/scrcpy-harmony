# 安卓投屏恢复与 Codex 宿主 MCP 验收

日期：2026-11-16（Asia/Shanghai）。基线 `23d6db2`，最终源码 `1f48fbd`，分支 `codex/agent-automation`；产品 1.0.5-dev.1、macOS arm64、Node v22.22.3。本地提交，未推送/发布/替换安装版。[脱敏验证记录](../scrcpy-plus/evidence/agent-automation/codex/2026-11-16/verification.json)保留失败、最终结果和原始记录哈希。

## 本轮结果

安卓投屏恢复；本机 Codex 已注册 `scrcpy-plus` 并通过真正 app-server 的工具发现、服务查询、参数错误、两台手机 PNG、Harmony XML 和租约清理验证。随后发现并修复窗口销毁后的延迟回调异常。最终保留源码构建的 Android/Harmony GUI 投屏，MCP lease 为 0；日常安装版按用户补充授权已退出，避免双应用冲突，安装文件没有修改。iOS 没有启动接收或控制测试，继续暂缓。

## AUTO-BUG-013：安卓 USB 访问失败难以定位

关联 AUTO-03/08。用户截图为日常安装版的通用连接失败。本机同一 USB 库的 claimInterface 探针实际得到 `LIBUSB_ERROR_ACCESS`；现有 SDK ADB server 正持有目标手机。精确 detach 该目标后点击原窗口 Retry，进入授权阶段，用户确认授权，真实桌面画面恢复。只操作核对过的同一台手机，未 kill-server、未启动第二个 ADB server、未批量释放其他设备。

这次恢复有环境前提：原生 USB 与 ADB 独占同一接口。上轮结束时恢复 ADB 接管会再次阻断 Plus；本轮日常版退出后，最终验收前又观察到手机回到现有 ADB 的 attached 清单，首次测试因此失败。具体重新 attach 的触发者未证明，不能断言由某个 IDE 自动触发。保留失败，再精确 detach 后最终双端验收通过。结束时保持 Plus 使用该接口，不再次 attach 造成用户投屏失败。

产品改动：`nativeMirror.ts` 对 Android ACCESS/BUSY（以及 SDK device-in-use）错误提供固定 `connectionIssue=usb-access`，通过现有 info/state IPC 给 renderer；中英文提示解释接口占用或权限拒绝以及释放后重试/手机授权。重试或连接恢复时清除旧原因；其他平台/其他错误不误报为 USB 冲突。原始错误不传给 UI。两项失败回归先 RED 再 GREEN；真实 Electron 模拟错误的中英文 520px 窗口中，正文换行与重试按钮已目视检查。

此改动没有实现多个程序同时使用 USB，也没有隐式夺取外部工具的设备。若后续要用 ADB，先关闭 Plus 对应投屏，再使用已核对目标的 `adb -s <serial> attach`；从 ADB 切回 Plus 则释放同一目标并重试。具体系统/ADB 是否支持 detach/attach，以本机 help 为准。

## AUTO-BUG-014：窗口销毁后的延迟位置保存

关联 AUTO-03/07。首次真实 Codex 截图/释放后，应用日志出现 `TypeError: Object has been destroyed`。映射到 `src/share/main/lib/window.ts` 的 1000ms 防抖回调：窗口已经销毁，仍调用 `isFullScreen()`。同一窗口层的 ready-to-show 兜底定时器也可能迟到显示已销毁窗口。

两处回调在访问窗口前检查 `isDestroyed()`。`shared-window-lifecycle.test.cjs` 用可控时间和真实共享窗口函数复现两个失败分支，并确认活窗口仍显示/保存；修复前 3 项中 2 失败，修复后与 native-window 相关的 15 项全通过。最终双端无 GUI owner 的释放确实 stopped，后续日志未再出现 destroyed-window 异常；有 GUI owner 时释放只移除 MCP lease。这里只声明已测场景，不推断所有窗口生命周期已穷尽。

## Codex 接入与验收边界

使用本机 `codex-cli 0.169.0-alpha.11.1` 的 `app-server --stdio`，由本机生成的 schema 确认 initialize、thread/start(ephemeral)、mcpServerStatus/list 和 mcpServer/tool/call。没有启动模型回合或创建持久侧栏聊天；不是把 SDK 测试客户端冒充 Codex 宿主。

已在用户 `~/.codex/config.toml` 增加一个 `mcp_servers.scrcpy-plus`，保留已有 computer-use/node_repl。command 指向本机 Node 22，args 指向当前 checkout 的 `dist/cli/mcp.cjs`，profile 为 `~/Library/Application Support/Scrcpy Plus Codex`，client 为 `codex-device`。改动前私有备份保留在忽略目录；回退只需 `codex mcp remove scrcpy-plus`，不要整份覆盖可能有后续修改的用户配置。

该 profile 对应当前源码构建的桌面服务，与旧日常安装版分开。本机服务通过 CLI 显式启动；后续为了留存排错日志以相同 profile 重启。新 app-server 实例实际读取保存的配置并调用成功。**当前已运行聊天的工具列表没有验证热加载**；若此聊天仍未出现工具，应新开使用该配置的 Codex 聊天或由宿主刷新 MCP。不宣称模型已自主完成一轮手机操作。

| 层级/场景 | 实际结果 |
| --- | --- |
| 宿主发现 | 35 个工具，数量与产品 schema 一致 |
| 离线 schema / 服务缺席 | schema 成功；服务缺席返回 isError=true、UNAVAILABLE；之后在线状态成功 |
| 真实设备查询 | Android/Harmony capabilities、Harmony overview 成功；provider errors=0 |
| 非法输入 | 负坐标 tap 被 INVALID_ARGUMENT 拒绝，未派发设备输入 |
| 外部 owner 冲突 | 日常版 Harmony 已投屏时测试构建拒绝控制恢复，相关 layout/capture 失败保留；关闭该窗口后通过，未强行杀外部捕获 |
| 最终独占租约 | Android 888×1920、Harmony 1206×542 的非 stale PNG；Harmony XML 17388 bytes；release 分别约8/233ms且 stopped |
| GUI 与 MCP 共享 | 两端再次取得实际 PNG；MCP release 分别约4/3ms，GUI会话仍 running，MCP lease=0 |
| 内容核对 | 实际 PNG 已目视核对真实手机画面；该MCP截图阶段未点击画面或发送文字，后续HAP测试单独见下节 |

本轮 Harmony 首图来自 JPEG compatibility 路径，不据此宣布原生 H.264 升档验收通过。iOS 仅出现在发现清单，没有测试接收/控制。截图/XML/序列号/token/配置备份不入库。

## 可复跑入口与验证

新增 [check-automation-codex.mjs](../../script/check-automation-codex.mjs)：要求已注册 scrcpy-plus 和正在运行的桌面服务；默认只做宿主/发现/错误映射，明确传 android/harmony/both 才启动真机截图；同平台多台 ready 设备或已有本客户端 lease 时拒绝继续，不清理别人的租约。输出目录必须新建；PNG与 stderr 为私有文件，公开时只取脱敏 verification.json。

```sh
node script/check-automation-codex.mjs /absolute/new-private-report
node script/check-automation-codex.mjs /absolute/new-private-device-report both
```

最后两个真机成功运行使用最终产品代码；脚本随后仅加强失败消息和 host 退出检查，最终只读宿主运行已验证该脚本版本。第一次 Android 占用失败、两次外部 Harmony owner 拒绝记录都保留，不用后续成功覆盖。

| 检查 | 结果 |
| --- | --- |
| npm test | 退出0；1096项，1094 passed / 2 skipped；Licia两模式各606 passed / 4 pending |
| npm run lint | 退出0，含i18n |
| npm run build | 退出0，完整桌面与CLI/MCP |
| npx tsc --noEmit --ignoreDeprecations 6.0 | 退出2；去除行列偏移后与上一轮基线一致，无新增诊断，非全仓类型通过 |
| check:automation-package | 退出0；临时安装、离线CLI/缺服务、MCP35工具 |
| check-automation-electron.mjs | 退出0；真实Electron，明确模拟设备，9项通过 |
| Codex宿主 | 独占双真机/GUI共享双真机/最终只读三个运行通过，宿主均退出0 |

## 补充：现有专用 HAP 的非破坏性写操作

从[历史HAP记录](hap-install.md)追溯后，在本机桌面找到HelloWorld两个签名包；SHA-256分别为 `7f2d38b11877412f4d8880cf9a57d5d04c8fa1bb32dae6fb03b2297d8e1a80b6`（1.0.0）、`4a302564608645cb7d4d9a524815bea555751c7fdcfc110a7ecf7b4334d09d1f`（1.0.1），与历史用户专用测试包一致。此前只查仓库/忽略目录不足以断言本机缺包，本节更正该判断。

真实手机已存在 `com.example.testhap` 1.0.1，所以没有卸载、清数据/缓存或降级。通过产品CLI的独立hap-acceptance调用者完成：同版本1.0.1覆盖安装（completed=true、cleanupConfirmed=true）→apps info确认版本→启动EntryAbility→apps top确认测试包前台→stop→apps top确认离开前台。覆盖约1115ms、启动452ms、停止431ms。前后应用集合一致，最终仍保留1.0.1；测试改变了前台应用，未操作账号或个人应用数据。

这验证了同版本覆盖、启动和停止；没有用集合相同冒充数据内容保持。干净首次安装、版本升级、清空/卸载仍需要可独立处置的测试数据范围，不能删除此前已有测试包的数据来补计数。

## 交接与剩余

当前源码服务和两端 GUI 投屏保留运行供用户使用；临时 MCP app-server 已退出，测试租约全释放。ADB server 保留，目标未交回 ADB；日常安装版关闭且未替换。此配置依赖当前 checkout/dist 及本机 Node 路径，清理或移动它们前需要更新配置/重新构建。

下一步：专用HAP的干净首次安装/升级和清数据/卸载矩阵、物理旋转及更广的断连/长期验证、Windows ACL/路径/进程生命周期。HAP已找到，但手机有既存测试数据，不擅自清除；本机没有Windows执行环境。实际 Codex app-server 接入已验收，不再作为“缺宿主”的待办；当前聊天热加载单独保留边界。iOS仍按用户要求暂缓。
