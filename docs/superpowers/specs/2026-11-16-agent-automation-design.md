# Scrcpy Plus Agent 自动化接口 Spec

- 编号：SP-AUTO-001；协议目标：v1；日期：2026-11-16（Asia/Shanghai）。
- 状态：2026-11-16 用户已确认方向，M1/M2 本机实现验证完成，M3—M6 继续实施；本文为完整目标契约，实际完成度见维护记录。
- 源码检查基线：`fb476c6`，开始时工作区干净；本轮没有执行运行或真机验收。
- [实施计划](../plans/2026-11-16-agent-automation.md) · [进度、证据与故障记录](../../maintenance/agent-automation.md) · [项目集成说明](../../scrcpy-plus/integration.md)。

## 1. 目标与授权边界

让 Codex 等 Agent 和普通脚本通过稳定接口完成“发现设备 → 建立会话 → 观察屏幕 → 输入操作 → 观察结果 → 释放资源”，并逐步覆盖现有设备工具。文档应使后续维护者可以从需求编号找到命令、生产代码、测试、证据及已知问题。

用户要求建立长任务、持续推进，只确认大致方向，不逐项确认实现细节。本文建议方向为：共享控制服务 → CLI 核心闭环 → 现有设备操作扩展 → MCP 薄适配。方向确认后，常规技术取舍、实现、测试、修复及文档维护自主执行；不设置逐阶段审批。仅根本改变方向时重新确认。设备授权、物理拔插等需要用户参与的验收记为外部条件，继续推进不依赖它的工作。

本任务交付本地源码、可运行开发构建、接口文档和验证记录；公开发布、合入远端或替换日常安装不属于本轮必需交付。历史 RUNBOOK 中其他任务的发布授权不自动延伸到本任务。

## 2. 当前实现与约束

| 当前入口 | 已核对事实 | 对新接口的影响 |
| --- | --- | --- |
| `src/main/lib/devices/index.ts` | 三端发现、启动选择、会话查询与停止；发现还会清理断开会话 | 需要结构化的分平台发现错误；不能误标所有发现调用为无副作用 |
| `src/main/window/nativeMirror.ts` | Android/iOS 后端和窗口绑定；输入校验 sender/mainFrame | 抽取共享操作方法，保留 GUI 校验；自动化使用独立调用上下文 |
| `src/main/window/screencast.ts` | 鸿蒙列表以窗口存在返回 running | 自动化就绪状态必须接入真实捕获/首帧事件 |
| `src/main/lib/hdc/captureSessions.ts` | 捕获会话、输入 owner、generation、恢复与清理 | 保留所有权和代际隔离，不伪造 Electron sender |
| `src/main/window/mergedMirrors.ts` | 组合画面读取各 renderer Canvas，并缓存旧帧 | 自动化截图需要独立的新鲜度和来源信息，不能把旧缓存当新截图 |
| `src/main/lib/hdc/{base,bundle,shell,port,uitest,hilog}.ts` | 鸿蒙工具通过 IPC 提供能力 | 提取业务入口，不将任意 IPC 名称暴露给外部 |
| `src/main/index.ts`、`package.json` | Electron 启动，无公共产品 CLI 入口 | 新增轻量客户端和应用内本地服务；不把开发脚本当产品 CLI |

继续使用 TypeScript、Electron 和现有 Android/Harmony/iOS 后端。Node 客户端最低版本沿用 `>=22.12.0`。首期支持桌面用户会话内的自动化；可以保留可见投屏窗口，不承诺无显示服务器的纯 headless。Android 不另起 adb/scrcpy 进程，iOS 不另起 UxPlay。

iOS 当前为单一 AirPlay 接收流，须由手机发起屏幕镜像；USB 设备身份不能可靠绑定来流，不支持反向控制。不可通过新增 CLI 宣称这些能力已存在。

## 3. 方案选择

| 方案 | 收益与成本 | 决策 |
| --- | --- | --- |
| CLI 直接另建设备连接 | 初期封装少，但与 GUI 争抢 USB、重复会话和恢复逻辑 | 不采用 |
| 应用内共享服务 + CLI，随后增加 MCP | 复用连接和业务规则；需要整理窗口耦合及本地服务生命周期 | 2026-11-16 用户已确认 |
| 先做独立无头守护进程 + 全量 MCP | 长期适合服务器，但当前解码、窗口及鸿蒙所有权重构范围大 | 不纳入本轮 |

具体命令名、文件拆分和测试实现由执行者决定；以下 v1 契约变更须同步 spec、测试和命令参考，不要求逐项询问用户。

## 4. 分层设计

```text
GUI IPC ───────────────────┐
CLI → 本地传输与鉴权 ──────┼→ AutomationService → 平台适配器 → 现有设备后端
MCP stdio → 同一本地客户端 ┘          └→ 会话/画面/输入所有权
```

- 服务驻留在持有设备连接的 Electron 主进程；CLI 和 MCP 不直接打开 USB。
- GUI 与外部调用共用业务实现，分别验证 Electron 窗口身份和自动化凭据。不开放通用 `invoke(ipcName, args)` 或任意 JavaScript 执行。
- 客户端连接显式 profile；服务地址由该 profile 的原子写入 discovery 文件提供。首期采用仅绑定 `127.0.0.1` 的随机端口 HTTP JSON 服务，实例级随机 token、协议版本和实例 ID。拒绝无凭据、错误 Host、携带浏览器 Origin 的请求，不启用 CORS；token 不出现在命令行、日志或返回结果中。
- profile 目录/凭据仅当前用户可访问（POSIX 权限、Windows 用户 ACL）；不使用公共临时目录暴露 token。相同 profile 单实例，陈旧 discovery 需校验进程/实例，不按端口存在就复用。
- `service start` 显式启动已配置的开发/安装应用，等待握手；其他命令在服务不可用时给出可恢复错误，不偷偷启动第二个后端。`service status` 可用于诊断。GUI 正常退出会关闭服务并取消任务。
- 首期客户端以独立 Node CLI 构建，明确需要 Node >=22.12.0；开发入口为拟新增 `npm run cli -- ...`，安装入口为 `scrcpy-plus ...`。独立包的 bin/安装步骤属于交付，不依赖全局改 PATH 或开发 inspector。无 Node 的安装器集成留后续。

## 5. 需求与验收契约

| 编号 | 必须交付的行为 | 主验收阶段 |
| --- | --- | --- |
| AUTO-01 | 按平台报告设备、稳定 key、状态、能力和发现错误；显式选择目标 | M1/M2 |
| AUTO-02 | 服务启停、版本握手、profile 隔离、鉴权、有限请求期限 | M1/M2 |
| AUTO-03 | 会话开始、状态查询、等待、停止；真实就绪与资源归属 | M3 |
| AUTO-04 | 截图有确定来源、时间、尺寸和坐标映射，不能返回占位或静默陈旧画面 | M3 |
| AUTO-05 | Android/Harmony 点击、滑动、滚动、文字、系统键；动作串行、失败有界 | M3 |
| AUTO-06 | 现有设备工具逐项登记并开放适用能力，平台不支持时明确报错 | M4 |
| AUTO-07 | JSON、退出码、超时、取消和不确定执行结果一致，非幂等动作不盲目重试 | M1—M4 |
| AUTO-08 | 操作手册、机器 schema、示例与 Agent skill 同步，命令示例可以验证 | M2—M5 |
| AUTO-09 | MCP 使用同一服务，能力和副作用描述准确，不引入第二套设备逻辑 | M5 |
| AUTO-10 | GUI 回归、跨客户端隔离、构建/包可用性和分层证据完整 | M6 |

### 5.1 目标命令面（以下均为拟实现命令）

| 命令组 | v1 范围 |
| --- | --- |
| `service start/status`、`doctor`、`schema` | 启动/探测、环境诊断、版本化机器契约 |
| `devices list`、`devices capabilities --device <key>` | 多平台发现、逐能力 supported/available/reason |
| `sessions start --device <key>`、`sessions list/get/wait/stop` | 获得会话 ID；后续命令显式传 `--session <id>` |
| `screen capture --session <id> --output <path>` | 导出当前会话的 PNG，返回元数据 |
| `input tap/swipe/scroll/text/key --session <id>` | 完整动作；首期不暴露需要调用者配对的裸 down/up |
| `apps`、`logs`、`processes`、`layout`、`ports`、`shell` | M4 按盘点矩阵开放现有鸿蒙能力 |

不默认选择第一台设备，不跟随 GUI 的 target/mirrorTarget。未知参数或重复冲突参数失败，不静默忽略。不存在设备和暂未授权分别返回错误。

M4 的必需盘点：设备概览；应用列表/详情/前台应用/启动/停止/安装/卸载/清数据/清缓存；进程查询；布局树导出；日志有限时间抓取；端口转发/反向/清单/删除；有期限的一次性 shell。进程结束、文件传输等源码盘点时不存在的能力属于后续新增范围，本轮不承诺实现。纯 UI、音频、iOS 控制、Android 无线配对、跨网络远程控制不在本轮范围。

### 5.2 返回、错误与长操作

- `--json` 的 stdout 仅有一个 JSON 结果；诊断写 stderr。`--help` 和 `schema` 在服务未运行时也能使用。v1 不要求日志无限流，日志导出使用有限时长并返回文件元数据。
- 结果信封：`{ apiVersion: 1, requestId, ok, data?, error? }`；失败为 `{ code, message, retryable, outcome: 'not-started'|'completed'|'unknown', details? }`。`data/error` 互斥。成功只表示命令声明的操作完成，不等于手机 UI 业务结果已验证。
- 退出码：0 成功；2 参数/协议错误；3 不支持；4 设备/服务/会话不可用或资源忙；5 未授权；6 超时；7 操作失败或结果未知；130 用户取消。具体 code 至少区分 INVALID_ARGUMENT、VERSION_MISMATCH、UNSUPPORTED、NOT_FOUND、UNAVAILABLE、BUSY、UNAUTHORIZED、TIMEOUT、OUTCOME_UNKNOWN、INTERNAL。
- 普通请求默认 30 秒；服务启动/会话等待默认 60 秒；安装默认 120 秒。`--timeout-ms` 为 1—600000 的整数，端到端统一截止时间；底层清理额外最多等待 5 秒，未清理完明确记录状态，不谎报已停止。
- 取消传播到队列和适配器；已发往设备的动作无法确认撤销时返回 unknown。`requestId` 用于关联诊断，不承诺持久幂等；输入、shell、安装/卸载等不自动重试。只读状态查询可有限重试，但遵守总截止时间。
- 请求 JSON 上限 1 MiB；截图和大日志不嵌入普通 JSON。截图内部二进制响应须鉴权并限制到 32 MiB；CLI 将数据写入调用端指定路径，默认拒绝覆盖，`--overwrite` 显式覆盖且使用临时文件原子提交。安装由本机服务读取显式绝对文件路径，校验文件类型、大小及目标能力，不做 shell 字符串拼接。

### 5.3 会话与多调用者

- 会话 ID 与 GUI 窗口 ID 解耦，并携带服务实例/代际信息；重启后旧会话失败。iOS 接收器始终保留 receiver 身份，不能冒充 USB UDID。
- `sessions start` 同设备复用后端，但为调用方分配 lease；返回 `{ sessionId, leaseId, state, created }`。CLI lease 可跨命令持有；普通命令退出不关闭会话。
- 客户端身份持久化在当前用户的客户端配置中，CLI 与 MCP 使用不同默认 clientId，可通过命名 client profile 分离多个 Agent；clientId 不是认证凭据，token 验证仍是本机用户信任边界。`sessions leases` 仅列出当前 client 的 lease，`sessions release --lease <id>` 可恢复清理；start 响应丢失时先查询再继续，不盲目重复启动。按 clientId + deviceKey 复用同一 lease；同一 client 的多个命令共享该归属，需独立生命周期时使用不同 client profile。已释放 lease 的凭据不出现在其他 client 的列表中。
- `sessions stop --session ... --lease ...` 释放自身 lease，重复释放成功；仅最后一个 lease 且无 GUI owner 时关闭后端。不能凭 session ID 停掉其他调用者的会话。显式应用退出仍终止全部本实例资源。
- GUI 关闭投屏窗口时，若仍有自动化 lease，则释放 GUI owner 并隐藏窗口，保留解码 renderer 和捕获 owner；再次从 GUI 打开则认领 GUI owner 并显示同一会话。最后一个 owner 释放才真正 destroy。隐藏/最后一次释放不得意外弹出主窗口；自动化 lease 存在时关闭主窗口可隐藏，菜单“退出”仍是终止全实例。renderer 崩溃不能视作普通关窗：会话转 error，通知客户端并执行有限清理，旧帧/代际失效。首期不引入独立无头解码器。
- GUI 与自动化共用每设备输入队列；一个完整手势执行期间不交错其他输入。断连/关窗/取消时尽力释放按键/触点；未确认释放则阻止后续输入并报告恢复需要，不无限排队。
- 自动化状态至少区分 starting、authorizing、waiting、running、disconnected、error、stopping、stopped；running 需要实际首帧，输入就绪另由 capability.available 表达。记录停止 tombstone 至少 5 分钟以支持重复 stop/get；状态变化需带递增 revision。

### 5.4 观察与坐标

- 截图返回 `{ sessionId, frameId, capturedAt, width, height, displayRevision, rotation, path, mimeType }`；frameId 标识已绘制帧，capturedAt 是采集/呈现时间，不是文件写入时间。底层没有设备时间时明确为主机时间。
- 首期可用 renderer 解码，但通过专用受 owner 校验的截图桥接获取，不用通用 executeJavaScript 接口给外部调用。没有真实帧、renderer 失联或视频断开均失败。
- 默认 `maxAgeMs=2000`；请求前画面更新不足时等待至截止时间。静止屏幕只有旧帧时允许调用者显式传 `--allow-stale`，结果标记 `stale:true` 和实际时间，默认不冒充新帧。如果平台支持主动新采集，可使用该路径并标记来源。
- 每次成功输入返回 observationToken，标记输入结束后向解码 renderer 确认的当前呈现序号和会话代际。`screen capture --after-action <token>` 等待严格更大的呈现序号，且满足 maxAgeMs，防止将动作前缓存作为动作后证据；静止/断流至期限仍无新帧则超时，不能用 allow-stale 绕过 after-action 条件。该 token 只保证新的呈现观察，不证明设备 UI 已处理动作或业务成功，仍须分析画面/布局。token 保留 60 秒，过期或会话代际变更则失败。
- 输入坐标使用截图像素坐标，原点为左上角。tap/swipe/scroll 必须传 `--frame <frameId>`；服务保存每会话最近 16 份**已导出给调用者的截图引用**及几何（最多 60 秒），不按每个视频帧淘汰引用；未知/过期帧失败。尺寸或方向 revision 改变时拒绝输入，要求重新截图。
- 转换同时考虑截图尺寸、视频有效区域及实际设备显示尺寸；Harmony 使用 getDisplaySize，不用 scale 反推。坐标必须有限且在图像范围内。text/key 不需要 frame；文字长度不超过 16384 个 UTF-16 code units，文字粘贴改变手机剪贴板须写入命令说明。
- v1 不保证 OCR/控件定位/自动判断点击业务成功；Agent 用下一张截图或平台已有布局树验证结果。

### 5.5 扩展与 MCP

能力矩阵对每项记录平台、现有代码入口、CLI/MCP 名称、支持状态、限制和验收级别。supported 表示实现能力，available 表示当前连接/授权/会话条件允许；二者不可混淆。

MCP 作为本地 stdio 适配器复用客户端和 schema。至少暴露设备发现/能力、会话生命周期、截图、输入和诊断，另按 M4 的语义操作扩展。大文件以资源或受限文件结果交付；截图提供宿主支持的图像结果。stdio stdout 不输出日志。根据真实行为标注只读/破坏性等提示，服务端仍执行鉴权和参数校验。协议 SDK 选择和当前规范在 M5 实施时再核对官方资料。

## 6. 文档与维护布局

| 路径 | 职责 |
| --- | --- |
| 本 spec | 需求、约束、决策；需求编号长期稳定 |
| `docs/superpowers/plans/2026-11-16-agent-automation.md` | 阶段、任务、代码入口及验收命令 |
| `docs/maintenance/agent-automation.md` | 当前状态、问题 ID、最新证据、下一步和恢复入口 |
| `docs/scrcpy-plus/automation/{README,cli,protocol,capabilities,troubleshooting}.md` | 实施时创建的用户/机器接口文档，标注已实现版本 |
| `docs/scrcpy-plus/evidence/agent-automation/<阶段>/<运行ID>/` | 实施时写入脱敏 verification.json、审查记录、必要的统计 |
| `.agents/skills/scrcpy-plus-automation/SKILL.md` | 实施时创建的工具使用 skill，与源码维护 skill 分开 |

验证记录包含源码 commit/dirty 状态及补丁标识、应用/CLI/协议版本、主机系统、测试命令、退出码、起止时间、结果、失败原因和未测范围。公开证据不保存 token、设备序列号、输入文本、原始日志或手机画面；诊断导出默认脱敏。问题记录采用 AUTO-BUG-xxx，链接需求、复现、层级、修复入口、回归和状态；设计决策用 AUTO-DEC-xxx。

## 7. 完成标准

1. AUTO-01—10 均有实现与可追溯验证；所承诺命令的 help/schema/文档一致。
2. Android/Harmony 核心流程通过模拟测试、真实 Electron 和分别的真机闭环；iOS 验证接收画面、状态及控制不支持。
3. 双设备/多调用者不串操作、不误停其他 owner，断连、超时和重启恢复有证据。
4. 现有 GUI 流程、应用测试、lint/i18n 与受影响构建通过；新增诊断不能藏进继承类型基线。
5. macOS/Windows 的 CLI 客户端、服务发现、鉴权及生命周期分别验收；无环境的矩阵明确 pending，不用模拟结果代替。
6. 缺少真机/系统时可以交付“实现完成、部分运行验收待补”的候选，但整个目标不标为全部验收完成。持续推进独立可做工作，剩余外部条件集中列出。

## 8. 设计决策登记

- AUTO-DEC-001（已确认）：共享服务 + CLI 优先 + MCP 后接，避免重复设备连接。
- AUTO-DEC-002（执行者默认）：首期依赖桌面 Electron，可见窗口允许；不承诺纯 headless。
- AUTO-DEC-003（执行者默认）：Node CLI + loopback 鉴权服务，安装器内置无 Node 启动器后续再做。
- AUTO-DEC-004（执行者默认）：M4 覆盖现有设备业务；新平台能力和纯 UI 设置不扩大首期范围。
- AUTO-DEC-005（执行者默认）：本轮只交付本地候选，发布/安装替换另行处理。

## 9. 实施校准（2026-11-16，M1/M2）

- 已实现的服务 schema 仅发布 service.status、doctor、schema、devices.list、devices.capabilities；service start 为 CLI 本地命令。后续目标命令不提前报告 supported。
- 查询设备时若部分 provider 失败，目标未找到返回 UNAVAILABLE；全部发现成功且无目标才返回 NOT_FOUND。
- 命名客户端身份采用私有文件和原子 hard-link 发布，CLI 并发启动不会读取半写入身份。
- 自动化目录有独立 server.lock；死进程锁仅由已取得 Electron 单实例锁的启动流程回收，身份不明则拒绝。
- 协议描述以独立 descriptions.json 保存稳定英文机器文本，GUI 国际化检查不放宽。
- M1/M2 Windows 权限/进程验证仍 pending；本机全仓严格类型检查仍不通过，不降低总验收标准。

## M3 实现澄清与待验证边界（2026-11-16）

- 图片传输使用 `application/vnd.scrcpy-plus.frame`：4 字节大端 envelope 长度，随后 UTF-8 JSON envelope 和原始 PNG。客户端负责文件输出，服务不接收主机输出路径。JSON ≤1 MiB，PNG ≤32 MiB。
- `rotation` 当前表示导出位图需要额外旋转的角度；解码画布已正向呈现，当前为 0。物理方向只能在平台提供可验证信息时声明；尺寸或解码代际变化会使 frame 引用失效。同尺寸 180° 物理旋转的检测仍待验证，不计为 AUTO-05 已验收。
- Harmony 没有 wheel primitive，`input scroll` 显式转换为 250 ms、端点限制在画布内的滑动；正 dx/dy 表示手指右/下移动，幅度为对应画布尺寸的 delta/2。Android 使用原生滚轮控制。
- 以上为 M3 实现中记录，未替代真实 Electron/设备/平台验收门禁。
