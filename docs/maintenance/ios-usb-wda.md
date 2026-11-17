# iOS USB WDA + ReplayKit（2026-11-16）

状态：**代码及自动验证完成；2026-11-17 真机签名安装、启动、截图、点击/Home、ReplayKit 基本播放及模式切换通过，长期稳定性等矩阵待补。** 最初按用户要求先完成代码，随后授权配置签名和真机验证。工作分支 `codex/ios-usb-wda`，基线 `62a7e28727a8feb20848ba340af492516a444c5a`。本轮未替换安装版、未提交发布。

## 实现

- USB iPhone 使用独立 `ios:<UDID>` 会话；AirPlay 接收器保持独立只读。
- usbmux 按 UDID 解析当前 DeviceID，连接 WDA 8100 或动态视频端口；HTTP 有界、取消、大小检查，写操作不重试。
- WDA 创建专用 session、请求 PNG（显式 quality=0）、提供点按/滑动/滚动/文字及有限按键；实际显示尺寸和方向参与坐标校验。取消的 GUI 手势不发送到手机。
- ReplayKit 创建自有 H.264 capture，处理 scrcpy 分帧和首个配置帧，复用 FrameGate/WebCodecs，启动/播放失败或旋转回到截图。
- 不调用全局广播 stop/stop-all：上游没有原子所有权检查。只停止自己的 capture；手机端结束屏幕广播，UI 已提示。
- CLI/MCP 复用现有会话、租约、输入队列与截图帧引用。状态不明的写入隔离后续输入；已知未执行的校验失败不误报成已发送。
- 准备脚本固定源码 SHA 和归档 SHA-256，局部指定 Xcode、显式 UDID/Team；未引入闭源 mobilerun-ios。

使用命令见 [iOS USB 配置](../scrcpy-plus/ios-usb-wda.md)，设计及步骤见 [spec](../superpowers/specs/2026-11-16-ios-usb-wda-design.md) / [plan](../superpowers/plans/2026-11-16-ios-usb-wda.md)。

## 验证证据

| 检查 | 实际结果 |
| --- | --- |
| `node --test --test-concurrency=4 test/*.test.cjs` | 1147 pass / 2 skip / 0 fail |
| `node script/test-licia.mjs`，另加 `--fallback` | 各 606 pass / 4 pending |
| `npm run lint` | ESLint、双语词条检查通过 |
| `npm run build:main` / `build:preload` / `build:renderer` | 三项通过 |
| `npx tsc --noEmit --ignoreDeprecations 6.0` | 55 项既有诊断，与 HEAD 临时基线逐字一致；不是全绿 |
| `npm run ios:wda -- build --unsigned` | Xcode 26.6 (17F113)、iOS arm64 Runner + Broadcast Extension，TEST BUILD SUCCEEDED；保留上游编译和分析警告 |
| `node script/check-ios-ui.mjs` | Electron 45、生产 React 组件、真实 PNG 解码/H.264 WebCodecs 编解码、截图回退/180° metadata、中英文点按/Home/视频开关通过；设备 IPC 模拟 |
| `node script/check-plus-ui.mjs` | 真实 Electron 双语设备列表/工作区、深浅主题、宽窄窗口与概览回归通过；模拟设备 IPC，含 USB iPhone |
| 独立代码审查 | 发现并修复 4 项：广播全局停止竞态、失败不回截图、点击时长包含查询延迟、最长手势请求超时；复核无重要遗留项 |

汇总：[verification.json](../scrcpy-plus/evidence/ios-usb-wda-2026-11-16/verification.json)。中英文界面及渲染结果：[ui.json](../scrcpy-plus/evidence/ios-usb-wda-2026-11-16/ui.json)。新增测试使用真实回环 TCP 但不是物理 USB，图像是明确标注的 fixture。

初次全核并发测试与 Xcode 编译同时运行时，CLI deadline 用例出现一次调度超时（请求未到达）；最终降低测试文件并发至 4 后通过，未修改 CLI 实现。另一个初次失败源于旧测试排除 USB iPhone，已更新为当前设备列表语义。Electron 单帧 H.264 探针先因编解码缓冲未出帧超时，改为实时配置并发送连续 6 帧后验证实际解码。

## 真机验收（2026-11-17）

2026-11-17 已识别新连接的 iPhone 13（iOS 26.4.2），Developer Mode 已开启。Xcode 27.2 完成 Runner 与 Broadcast Extension 签名构建，严格签名校验通过，设备应用列表确认 Mobilerun 已安装。首次启动明确失败于 `Developer App Certificate is not trusted`，用户确认「VPN 与设备管理」没有开发者 App 条目；该错误不能单独归因为缺少手动信任。进一步核对实际签名证书在有效期内且包含在嵌入 profile 中，Runner/扩展 entitlement 与团队匹配。profile 存在 `PPQCheck: true`，按 [Apple 官方说明](https://developer.apple.com/help/account/provisioning-profiles/provisioning-profile-updates) 需要设备首次联网验证；用户直接打开 Mobilerun 确认提示“无法验证／需要互联网连接”；联网后重跑成功，WDA 8100 与广播控制服务启动，无需手动安装证书。

补充修复：显式 `--allow-provisioning` 且指定 UDID 时增加 `-allowProvisioningDeviceRegistration`；无该标志不注册设备，脚本专项 2/2 通过。开发证书链补齐经验证的 Xcode 内置 Apple WWDR G3，未修改信任策略；macOS 钥匙串授权由用户在系统弹窗完成。验证使用独立临时配置的当前开发版，未替换日常安装版。

实际验证通过：

- 当前开发版产品 CLI 获取 1170×2532 PNG 真机截图。
- ReplayKit H.264 780×1688 实际解码显示；视频模式按截图像素 (120, 790) 打开「实用工具」。
- 切回 PNG 模式，按截图像素 (585, 1230) 打开计算器；点击前核对新截图与已观察画面一致，点击后检查稳定画面确认效果。
- Home 返回主屏幕，截图/视频双向切换通过。after-action 的首张新帧可能仍是过渡前画面，额外观察稳定帧后才判定成功。
- 自动化自有租约已释放（剩余 0）；原租约为唯一所有者，释放后会话正常停止，随后从 GUI 重新启动并确认连续视频显示计算器，交给用户继续操作。WDA 保持运行，未替换日常安装版。

脱敏证据：[verification.json](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/verification.json)。手机内容截图仅保存在本地临时目录，不纳入公共证据。

后续待验收：持续视频的延迟与长期稳定性；旋转/180°、锁屏、取消、USB 拔插、两台 iPhone 隔离及 GUI/MCP 并发；文字/复杂手势；Windows Apple 服务与跨主机连接。

## 投屏布局统一（2026-11-17）

按用户截图反馈移除 USB iOS 运行时独有的顶部设备名、连接状态、说明和按钮区，画面与 Android 一样无内边距；Home/视频切换/模式提示迁至复用 Harmony 样式的标题栏「⋯」浮动工具栏，支持空闲收起和 Escape，展开不改变画面尺寸。错误和连接中状态仍可见。

21 项原生窗口/渲染测试、lint/i18n、renderer 构建通过；真实 Electron 中英文 UI 验证截图 Canvas 从内容区顶部开始，展开前后尺寸完全一致，Home/视频切换及 PNG/H.264 解码仍通过（模拟 IPC，[报告](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/layout-ui.json)）。本机开发版已重开真机投屏，实际观察额外区域消失、完整计算器画面、工具栏展开及 Escape 收起；未替换日常安装版。

## 运行中断与错误布局修复（2026-11-17）

用户随后报告运行中出现 WDA 准备提示并再次撑高顶部。现场 USB 仍连接、Runner 进程存在，但生产 WdaClient 的只读 `/status` 报 `write EPIPE`；重启本次专用 Runner 后恢复 ready。底层服务/传输中断原因未确定，不将修复客户端恢复逻辑等同于消除了全部断连原因。

已修复：观察轮询一次失败即永久停止；改为最多连续三次失败内恢复只读轮询，不自动重建 session、不重放输入。WDA 重启后旧 session 删除失败时，再查询 status；仅确认 ready 且旧 session 已消失才释放本地归属，不能查询/仍是旧 session 则保留错误。运行中异常改为居中浮层，不改变 Canvas 和窗口比例；旧帧变暗、恢复提示消失，已出图后的异常不再显示初次签名设置指南。

两项新增回归先失败后通过；35 项专项、全量应用 1157 pass / 2 skip / 0 fail、lint/i18n、main/renderer 构建通过。真实 Electron 中英文覆盖错误/恢复几何不变、旧帧变暗、PNG/H264 和控制（模拟 IPC）。当前开发版和专用 WDA 已重启，真机新帧持续更新，Home 返回主屏幕通过；自有自动化租约已释放，GUI 保持运行。详见 [recovery.json](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/recovery.json) 与 [UI 报告](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/recovery-ui.json)。运行日志仅保留本地临时目录；长期稳定性和完整拔插/重启矩阵待验收。

## GUI 输入堆积与恢复（2026-11-17）

用户截图显示实时画面上残留“Connected / Could not send input”大浮层。现场旧进程日志记录 86 次 `Device input queue is full` 和 10 次 `A GUI gesture is already in progress`。GUI 每个 wheel/move 都直接发送 IPC，慢速 WDA 操作导致队列堆积；另一个缺陷是 display metadata 暂不可用时连 up 都被丢弃，GUI 手势占用无法释放。

新增 `NativeInputFlow`：USB iOS 同时最多一个输入 IPC，合并尚未派发的滚轮和移动，保留抬手/取消；前一次释放未完成时不开始新手势。失败后丢弃等待输入、不重放动作，取消只清理缓冲手势。尺寸丢失时仍发送释放；窗口卸载清理。输入错误采用底部小提示及“重连控制”，不显示误导的 Connected 大浮层；`nativeMirrorOpen(restart?: boolean)` 在校验窗口 owner 后显式废弃旧队列、清理后端再重建，成功后新建 renderer 输入流。

验证：丢失几何时抬手回归先失败后通过；28 项专项通过，涵盖 200 次滚轮/移动合并、手势失败/卸载清理、重连等待旧后端清理。应用全量 1164 pass / 2 skip / 0 fail，lint/i18n、main/renderer 构建、diff 检查通过。真实 Electron 中英文使用模拟设备 IPC，验证底部提示、Canvas 尺寸不变、显式重连恢复点击及 PNG/H264。报告：[input-ui.json](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/input-ui.json)。

已重启当前隔离配置的开发版，未替换安装版。真机 GUI 鼠标打开实用工具和计算器；截图模式连续滚轮/拖动后点击数字，9 → 91；ReplayKit 模式连续滚轮后点击数字，91 → 912；运行日志无新增 nativeMirrorInput 错误。窗口和专用 WDA 留存供用户继续验证，本轮未创建自动化租约。复测前再次出现 WDA EPIPE，重启专用 Runner 后恢复；服务中断根因仍未解决。未注入真机输入故障验证重连，完整故障矩阵及长期稳定性仍待验证。脱敏汇总：[input-recovery.json](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/input-recovery.json)。

## 状态卡片与工具入口视觉优化（2026-11-17）

按用户对错误浮层和左侧入口的反馈，连接状态统一为 320px 上限的紧凑卡片：图标、标题、次级说明、主操作按钮。首次 WDA 准备说明折叠为连接清单；已断连时不再叠加输入错误文案。输入失败保留底部通知并统一视觉样式。支持深浅主题、键盘焦点、减少动态和透明效果偏好；状态卡片仍绝对定位，展开清单不改变 Canvas 几何。

USB iOS 工具入口从左侧省略号改为标题栏右侧的 16px 调节图标，入口常驻且单击打开；面板向右对齐，宽度上限 320px，按钮/模式/说明分层，面板空闲收起。共享 Harmony 入口位置不变。

验证：12 项输入/渲染回归、lint/i18n、renderer 构建、diff 检查通过。真实 Electron 模拟 IPC 验证中英文 × 深浅主题 × 280/460px 宽度共 8 组：准备说明展开、重试、右侧入口及 Canvas 尺寸不变；原 PNG/H264、Home、视频切换和重连流程继续通过。[UI 报告](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/status-design-ui.json)，[浅色预览](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/status-design-light.png)，[深色预览](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/status-design-dark.png)。

当前开发版投屏窗口已重开并加载新样式；真机连续视频保持运行，现场确认右上角按钮单击展开/收起，不占用额外画面高度。未替换安装版；本次仅优化展示，不将其计为 WDA 稳定性问题已解决。

## USB 拔插自动恢复（2026-11-17）

用户实际拔插后旧进程先报 USB device not found/connection refused，Xcode 测试连接结束；随后只读 WDA `/status` 已 ready、sessionId 为空，应用重试却仍报 HTTP 404。阻塞点是旧 `IosVideo.close()` 停止已经失效的 capture 路由失败，发生在 IosMirror 的旧 WDA session 清理之前，导致已有 session 消失确认逻辑无法执行。另外设备发现对 iOS USB 缺席直接调用 stop，破坏了可恢复窗口的生命周期。

修复：视频 stop 失败后，先查询 ready，再通过只读 standalone capture 路由确认精确 ID 不存在才释放归属；资源仍存在或无法确认则保留失败，不停止全局广播。成功的 iOS 发现结果交给 `NativeMirrors.reconcileIos`，拔出时保留窗口和归属、使旧帧和输入失效；仅同一 ready device key 重现时串行清理并重开后端，恢复此前视频模式。恢复视频沿用共享输入队列。另一台 iPhone 不接管原窗口；用户关闭窗口后不会因发现事件重新打开。自动化收到恢复的 connected 后先进入 starting，只由新画面变为 running；renderer 重建被阻断的 GUI 输入流，旧动作不补发。

4 项回归先失败后通过；80 项专项、应用全量 1173 pass / 2 skip / 0 fail、lint/i18n、main/renderer 构建及 diff 检查通过。最终补充视频恢复走共享队列，27 项相关测试通过。

本机隔离开发版更新后，用户再次真实拔掉 USB、等待约 10 秒再插回，未点击重试。运行日志确认设备缺席；同一个会话自动恢复 running，工具栏确认 ReplayKit video，GUI 点击打开实用工具及计算器，数字 6 → 61，未出现 nativeMirrorInput 错误。验证周期内未重启 WDA，未创建自动化租约，GUI 保持运行；最终队列包装调整在该次实测后通过专项验证。本轮仅实测一次拔插，多次快速拔插、锁屏及多机隔离继续待验收。若 WDA 本身没有恢复运行，仍需启动 Runner；客户端不自动签名或启动它。详见[脱敏证据](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/usb-reconnect.json)。

## 概览支持 USB iPhone（2026-11-17）

概览选择器、持久化恢复和刷新现在包含 USB iPhone，继续排除 AirPlay 接收器。统一 getDeviceOverview IPC 增加 iOS 分派，通过 usbmux/lockdown 的固定 GetValue 白名单读取基本信息，8 秒总截止，结束释放连接，不启动 WDA、不读取完整属性字典。页面显示系统/构建版本、UDID、名称、产品/硬件型号、架构和品牌；可选序列号未返回时显示未知并禁用复制。鸿蒙工具导航和工具卡对 iOS 禁用，概览保留开始投屏入口和原有过期请求隔离。

应用全量 1176 pass / 2 skip / 0 fail，lint/i18n、main/renderer 构建通过。新增真实回环 lockdown 字段白名单测试、USB/AirPlay 目标隔离、IPC 路由和持久化导航保护；真实 Electron 中英文/深浅主题验证 iOS 概览及跨平台切换（模拟 IPC）。当前最新源码版本已重开并沿用用户配置，实际概览已选中连接的 iPhone，显示 iOS 26.4.2、构建版本、iPhone14,5、arm64e 等返回信息，手动刷新成功。此设备未返回序列号；未宣称新增 iOS 应用、Shell、日志工具或 CLI overview 能力。[汇总](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/overview.json)、[UI 验证](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/overview-ui.json)。

## 默认启用连续视频（2026-11-17）

新建 USB iPhone 投屏窗口默认请求 ReplayKit；首张 PNG 建立控制几何后通过共享输入队列启动视频，不再要求手动点击开启。用户在同一窗口手动选择截图后，USB/显式重连保留选择；新窗口重新默认视频。启动失败仅在后端确认自有 capture 清理并恢复新截图后保留回退，清理不确定仍进入连接错误。工具栏启动期间显示启动中并禁用重复操作。

4 项新增回归修改前失败、修改后通过；54 项专项与应用全量 1180 pass / 2 skip / 0 fail，lint/i18n、main/renderer 构建通过。当前源码版本已重启。真机经 CLI 新建会话，无视频开关调用，确认 running/video，实际解码帧 780×1688、sequence 241、非过期；验证租约已释放，GUI 保持播放。首次附加浏览器调试器时新窗口缺少 VideoDecoder 而回退 PNG；重启后在无调试器附加的情况下创建窗口可正常播放，调试器关联问题根因未确定，不将其归为设备故障。本轮未重复真实拔插矩阵。详见 [默认视频证据](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/default-video.json)。

真实 Electron 双语/深浅主题验证启动按钮禁用和启动中文案、PNG/H264 与模式切换通过（模拟设备 IPC），见 [UI 报告](../scrcpy-plus/evidence/ios-usb-wda-2026-11-17/default-video-ui.json)。

## 独立审查修复（2026-11-17）

后续修复了重连过程中输入流二次替换、旧异步帧跨连接发布、断开后的延迟 GUI 写入及未知分配清理。WDA 增加原子会话保护和进程标识协议，旧 Runner 必须更新；客户端不再只依赖创建前状态检查。本文前述“成功后新建 renderer 输入流”已由状态换代驱动重建取代，不能在 open 完成时重置使用中的输入流。完整验证、真机部署和剩余限制见[审查修复记录](ios-review-fixes-2026-11-17.md)。
