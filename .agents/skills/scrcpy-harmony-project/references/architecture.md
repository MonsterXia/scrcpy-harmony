# 架构与代码导航

本文路径均相对仓库根目录。范围：应用结构、IPC、功能路由、状态、投屏、UI 约定。构建与测试见 [开发与验证](development.md)。

## 项目身份与目录

`package.json` 的包名为 `scrcpy-harmony`、产品名为 `Scrcpy Harmony`，仓库目录名为 `scrcpy-harmony`。项目基于上游 `liriliri/echo`，由 MonsterXia 独立维护，2026-10-21 已解除 GitHub fork 关系；仓库、反馈和发布入口指向 `MonsterXia/scrcpy-harmony`。保留原作者和许可证；应用 ID 为 `io.github.monsterxia.scrcpyharmony`，与上游 ECHO 分开安装，用户数据采用新的产品名目录，旧配置保留且不自动迁移。操作当前 Git 远端时仍使用 `git remote -v` 核对。

共享模块在 ready 时初始化更新监听并设置上游源；`src/main/index.ts` 随后调用本项目 `src/main/lib/updater.ts`，覆盖为本仓库 `ReleaseProvider`。菜单的 **Beta Update** 默认关闭，使用 settings.json 的 `betaUpdate` 布尔值持久化；关闭只选正式版，开启将所有正式版与预发布版按 SemVer 取最高版本，检查中改选项仅影响下一次检查。始终禁用降级、自动下载和退出安装，本地构建也可显式检查。

`ReleaseProvider.ts` 完整分页读取 GitHub Releases；API 403/429 时改读公开 Release 页，`releasePage.ts` 只解析发布卡片标题与标记、核对同仓库递增分页，结构未知/截断或上限未能确认完整时拒绝。请求共用 30 秒网络取消预算，API 最多 10 页各 100 条、网页最多 10 页，不拿部分清单宣称最新。选中 tag 后读取 Windows `latest.yml`、macOS arm64 `latest-mac.yml`、macOS x64 `latest-x64-mac.yml`，核对元数据版本与 tag 一致；名称仍与 `script/pack.mjs` 对齐。

共享更新协调器在网络前立即打开 `src/main/window/update.ts` 的独立更新窗口，合并重复检查；`src/renderer/update` 显示 400×146 进度窗口及约 260×234 结果卡。取消在 AppUpdater 异步初始化前登记，立即关闭展示并抑制迟到结果；旧请求排空后才允许下一次实际请求，以免复用取消中的库 Promise。初始化中的文件操作本身无法强制中断，取消后的窗口可重开显示等待并再次取消。新的版本不适用于系统/灰度时单独提示，不称为没有更高版本。`getUpdateState`、`updateAction` 仅接受该窗口的 main frame，状态通过 `updateState` 发送；renderer 用 `main.on` 返回值退订。更新窗口恢复最小化父窗口，跟随置顶，支持 Cancel/Escape/Enter；仅明确点击下载按钮时打开选中 tag 的 Releases 页面。

| 路径 | 职责 |
| --- | --- |
| `src/main/` | Electron 主进程：启动、窗口、设备操作、持久化 |
| `src/preload/` | `contextBridge`、类型化 IPC 调用封装 |
| `src/renderer/main/` | 主窗口的设备管理面板 |
| `src/renderer/screencast/` | 独立投屏窗口、Canvas 和输入控制 |
| `src/renderer/lib/` | 跨业务窗口辅助方法，如 HAP 安装、store 序列化 |
| `src/common/` | 应用类型、国际化和主题 |
| `src/share/` | 由固定 `electron-share` 快照内置：窗口、IPC、日志、公共页面及组件 |
| `src/renderer/icon/` | 由固定 `icon-share` 快照内置：图标生成源 |
| `vendor/packages/` | 本地维护的 HDC/Licia/Luna 源码；npm file 依赖，编译入口 `script/build-vendor.mjs` |
| `script/` | 本地依赖生成、上游测试适配、资源下载、发行构建与验收 |
| `build/` | 已跟踪的应用图标资源；不是可随意删除的构建产物 |
| `test/` | Node 应用回归：设备与窗口生命周期、IPC、构建、更新及依赖生成；Licia 上游测试另在其包内 |
| `RUNBOOK.md`、`docs/maintenance/` | 分阶段维护、验收与来源索引 |
| `dist/`、`release/`、`resources/` | 被忽略的编译输出、安装包和下载资源 |

## 本地依赖与构建职责

应用仍使用原包名导入，根 `package.json` 通过 `file:vendor/packages/*` 指向 18 个本地包。`src/share` 和 `src/renderer/icon` 为普通跟踪目录；旧子模块初始化仅适用于 v1.0.3 及更早 tag。

- `script/build-vendor.mjs`：统一编译入口、源码监听与成功完成标记。
- `script/lib/vendor-build.mjs`：HDC/Luna TypeScript 转译、声明、Luna 样式及图标选择器前缀；调用 Licia 生成器。
- `script/lib/licia-build.mjs`：从原始模块提取依赖和类型，生成 CommonJS、声明及环境入口。
- `script/lib/vendor-vite.mjs`：本地 CommonJS 支持、Licia 浏览器预打包及依赖重编译后的 Vite 重启。
- `script/lib/vendor-notices.mjs`：汇总来源和许可证；`script/build.mjs` 将其与应用 LICENSE 放入发行目录。
- `script/test-licia.mjs`：原始 Node 用例选择、临时夹具及隔离 fallback 测试。

原始文件、生成产物及命令的对应关系见[仓库结构指南](../../../../docs/repository-guide.md)，二次适配规则见 [vendor README](../../../../vendor/README.md)。原生 HDC/uitestkit 仍由资源脚本下载；内置 hdckit 源码不包含原生 HDC 的编译工程。

## 启动和页面

1. `share/main` 先注册 ready 处理并初始化共享语言、主题、IPC 和更新监听；`src/main/index.ts` 的 ready 处理随后覆盖本项目更新源，再初始化共享 terminal、HDC，显示主窗口并初始化菜单。
2. `src/main/window/main.ts` 创建名为 `main` 的窗口，注册主/设置 store IPC 和投屏窗口入口。
3. `src/preload/index.ts` 暴露全局 `main`、`preload`、`node`，并声明其 TypeScript 类型。其中 `main` 合并共享模块与本项目接口。
4. `index.html` 加载 `src/renderer/main.tsx`。该入口按 URL 的 `page` 参数懒加载页面：默认主窗口，`screencast` 是投屏，`terminal`、`process`、`about` 来自共享模块。这里没有 React Router。

主窗口关闭时，若投屏窗口可见则隐藏主窗口，否则退出应用。投屏窗口在 `close` 中销毁自身，在 `closed` 中释放单例引用并重新显示主窗口；close/closed 都会先失效捕获 owner、解除本地监听，覆盖 WebContents destroyed 晚于 closed 的真实事件顺序。设备停止仍需异步确认，见 [捕获会话所有权](../../../../docs/maintenance/M2-3-capture-ownership.md)。

## IPC 边界

```text
React 组件 / MobX store
  → 全局 main.someMethod(...)
  → src/preload/main.ts 的 invoke('channel')
  → 主进程 handleEvent('channel', handler)
  → hdckit Client / Target / UiDriver
  → 鸿蒙设备
```

HAP 拖入由主窗口和投屏根组件各注册一次 `src/renderer/lib/useHapDrop.ts`，覆盖窗口客户区；应用面板局部 drop 只清理高亮，不重复安装。`installDroppedBundles` 提取文件、识别大小写扩展名并处理无设备/不支持/读路径失败，调用共用 `installBundles`；逐包成功/失败通知中的文件路径按文本转义。共享通知容器随 `fullscreenchange` 移入/移出全屏元素，长路径可在窄窗口内换行。`installBundle` IPC → `hdc/bundle.ts` → 本地 hdckit `InstallCommand` 使用 `hdc install -r` 显式覆盖，不先卸载；大写 `.HAP` 复制为临时小写扩展名以兼容原生 HDC，成功/失败均清理，不改原件。

请求类型集中在 `src/common/types.ts`。主进程设备处理器集中在 `src/main/lib/hdc/`，注册由 `src/main/lib/hdc.ts` 的 `init()` 串起；窗口类处理器在 `src/main/window/`。

捕获的 create/start/stop 和 retryCaptureVideo/finishCaptureVideo 通道由 `hdc/captureSessions.ts` 直接注册 `ipcMain.handle`，保留并验证 Electron sender/senderFrame；不能套用会丢弃 event 的共享 handleEvent。投屏窗口须在 loadPage 前注册到会话管理器。视频升档使用原 lease、generation 和独立 promotion ID，JPEG 持续显示至 renderer 确认实际绘制；启动等待不占设备输入队列，driver 负责关闭前等待尝试和清理完成。详见 [JPEG 恢复视频](../../../../docs/maintenance/screencast-video-upgrade.md)。

注意 API 名不一定等于 channel 名：renderer 的 `main.dumpLayout()` 使用 `dumpWindowHierarchy` channel。排错时核对桥接字符串，而不只搜方法名。

推送使用共享 `window.sendTo()` / `sendAll()`，renderer 通过 `main.on()` 订阅。常用事件：

| 事件 | 数据或用途 |
| --- | --- |
| `changeTarget` | HDC 设备增删后通知主窗口刷新设备列表 |
| `bundleInstalled` | 安装成功后的 connectKey；应用面板按当前设备过滤并合并刷新，覆盖投屏/其他面板发起的安装，订阅随面板生命周期清理 |
| `changeMainStore` | 主 store 的 name/value 变更，投屏用它同步当前设备 |
| `changeSettingsStore` | settings store 的 name/value 变更，主窗口设置页接收菜单等外部修改；按字段修订号隔离迟到的初始读取和保存结果 |
| `captureScreen` | 直发原 WebFrameMain 的 sessionId、generation、图像字节；H.264 附 codec/timestamp/config/keyFrame 元数据，运行错误用 codec=error |
| `shellData` | 发给主窗口的 sessionId 与终端文本 |
| `hilogEntry` | 发给主窗口的 hilogId 与日志条目 |

增加事件时检查订阅者按设备或会话 ID 过滤，以及退出/切换时的取消订阅。`share` 的 IPC 和窗口内部机制直接查看本仓源码，不能仅凭调用点推断。

## 功能定位

下表 UI 路径均以 `src/renderer/main/components/` 为前缀，设备路径均以 `src/main/lib/` 为前缀。

| 功能 | UI 入口 | 设备实现 |
| --- | --- | --- |
| 设备选择、概览、按键、截图 | `workspace/DeviceSwitcher.tsx`、`overview/`、`screenshot/` | `hdc.ts` |
| 应用安装、启停、卸载、信息 | `application/`，安装公共方法在 `src/renderer/lib/util.ts` | `hdc/bundle.ts` |
| 进程列表 | `process/Process.tsx` | `hdc/base.ts` 的 `getProcesses` |
| 交互 shell | `shell/Shell.tsx`、`shell/Term.tsx` | `hdc/shell.ts` 的 HdcPty/sessionId |
| 布局树、属性与截图 | `layout/`，XML 工具在 `src/renderer/main/lib/util.ts` | `hdc/uitest.ts` 的 `captureLayout` 与 XML 转换 |
| 端口转发 | `overview/PortMappingModal.tsx` | `hdc/port.ts`，通用 `forwardTcp` 在 `hdc/base.ts` |
| WebView 调试 | `webview/Webview.tsx` | `hdc/webview.ts` 查 unix socket、建立转发并取 `/json` |
| HiLog | `hilog/Hilog.tsx` | `hdc/hilog.ts`，pid 名称缓存依赖 `hdc/base.ts` |
| 设置 | `settings/SettingsContent.tsx`、`src/renderer/main/store/settings.ts` | `src/main/lib/store.ts` 和 `src/main/window/main.ts` |

`hdc/hilog.ts` 在暂停或关闭时使当前流的在途 PID 名称补全失效；恢复只接受恢复后的记录。关闭解除 reader 的 entry 监听并结束 reader，迟到的暂停/恢复/关闭 IPC 为无操作。PID 查询失败时保留活动记录，以 `pid-<数字>` 回退并记警告；已失效回调不更新缓存或发送记录。此边界不取消共享 PID 查询，也不撤回已发送 IPC；renderer 的“清除”仅清空本地记录。

设备参数统一使用 `connectKey`（来自 `ITarget.key`）。`hdc/base.ts` 提供 shell、端口与按设备分组的运行时缓存；不要误认为它是持久化 store。

`hdc/finiteShell.ts` 是有限命令适配器：调用方显式提供服务 IP/端口、总截止和可选 AbortSignal；模块独占 TCP socket，取消后 destroy 并等待本地 close，不管理共享 HDC 服务。`getOverview` 按顺序执行五条固定只读命令：`param get` 10 秒、`SP_daemon -deviceinfo` 15 秒、`uname -a` 10 秒、`cat /proc/meminfo` 10 秒、`hidumper -s RenderService -a screen` 15 秒。每条独立计时，没有统一概览截止；失败立即拒绝且不启动后续读取、不回退旧 shell。它们与 Hdc.createClient 共用显式端点：host 为 `127.0.0.1`，port 按锁定 factory 的规则从 `OHOS_HDC_SERVER_PORT` 解析一次，空值/非数字回退 8710，非法范围明确拒绝。概览不再自动启动 HDC 服务；初始化 tracker、getTargets 的 host listTargets 及其他 hdckit 调用保留原服务启动路径。getTargets 在 host 列举完成后，对每设备 param get 并发使用同一有限模块和 10 秒预算；失败独立过滤，保留健康设备及原顺序，全部失败仍拒绝。整个枚举没有统一截止，host 列举及初始化本身仍未限时，详见 `docs/maintenance/M2-2-target-deadlines.md`。base.shell、终端、HiLog 和投屏的一般准备未迁移；控制服务恢复检查单独使用 finiteShell。hello 仅接受 16 或已观察到的 44 字节，首八字节匹配 OHOS HDC，尾部不回显，回复为原 banner 12 字节及目标 32 字节。未知长度、截断和 16 MiB 输出超限继续拒绝；更多协议变体与预算校准仍需验证。详见 `docs/maintenance/M2-2-overview-deadlines.md`、`docs/maintenance/M2-2-handshake-compat.md` 及内存/屏幕历史报告。

`hdc/parameters.ts` 的同步 `parseTargetParameters` 供枚举及概览有限读取共用；旧 `getTargetParameters` reader 导出保留，但这两个处理器不再经其读取。解析前拒绝行首 `[Fail]`、`[E` 加六位数字 `]`、`error:` 等明确命令错误；合法参数值中的同名文本不算错误，缺少可选字段仍交给上层兼容处理。解析层不修改服务生命周期或共享 shell。

概览 `Overview.refresh()` 在读取失败后清空旧概览并提示错误，释放加载状态后允许再次刷新，避免将上次数据呈现为当前结果。设备选择器位于概览内，`overviewTarget` 支持 Android/Harmony/USB iOS（排除 AirPlay）；`target` 继续只供鸿蒙工具使用。概览组件不跟随 HDC target key 重挂载，以 key/平台/state 的语义身份管理读取会话，禁止以设备对象引用判断轮询中的同一设备。统一 IPC `getDeviceOverview` 按当前发现记录分派；Android 固定只读命令与有界读取见 `devices/androidOverview.ts`，连接复用/临时连接/停止期归属见 `devices/android.ts`。多端投屏页的勾选启动与已创建窗口排列范围独立，`getMirrorLayout`/`focusMirror` 不创建或重启视频会话。

`hdc.ts` 的 `getTargets` 对每个设备单独读取参数并隔离失败，保留可读取设备的原始顺序。版本从可识别的点分数字字段提取；缺失或未知版本返回空字符串并记警告，名称缺失回退到 connectKey，API 字段缺失返回空字符串。`listTargets` 失败记录 error，非空设备列表全部读取失败记录 warn，两者均拒绝 IPC；正常无设备记录 info 并返回空数组；部分设备失败仍返回其余设备。成功返回类型仍为 `ITarget[]`。主窗口 `refreshTargets()` 捕获失败、清空列表和选择、设置 `targetsError` 并返回 false；初始化和设备事件刷新也使用此路径。`workspace/DeviceSwitcher.tsx` 区分读取失败与正常无设备，手动刷新按布尔结果提示成功或错误，并在组件卸载后忽略通知。

并发设备刷新按发起顺序分配序号，只有最新请求可以发布列表、选择、错误状态及持久化写入。已被后续请求取代的调用返回 `undefined`，工具栏不显示这次调用的通知；有效调用继续返回成功/失败布尔值。此保护不取消已发送 IPC，也不限制 HDC 等待时间。

`hdc/bundle.ts` 的 `getBundleInfos` 逐应用执行单条 `bm dump -n`，将命令、解析、结果与 bundleName 绑定；不再使用共享 shell 的字符串分隔符拆分批量结果。失败项带 connectKey / bundleName / 原因日志并跳过，其余结果保持请求顺序。缺失主模块或启动能力时保留应用并省略 mainAbility；在线名称/图标失败保留本地字段。可选商店查询由 `hdc/onlineBundleInfo.ts` 管理：3 秒总截止并取消包括 HTTPS CONNECT 的底层连接、请求级独立 Agent、同包请求合并、跨包串行和 30 秒网络失败冷却。有效字段缓存 1 小时、缺失条目缓存 5 分钟，上限 500 项，均为进程内缓存；HTTP 404 不触发全局冷却。失败只日志包名和白名单错误码，不输出 Axios 对象。无网络时保留本地名称/版本并使用默认图标，不代表实现离线真实图标。IPC 仍返回 `IBundleInfo[]`，renderer 仍每五个包刷新一批。Application.tsx 用面板生命周期内的同步引用串行处理刷新，将在途期间的安装/卸载刷新请求合并为后续一轮，重新读取系统应用选项；卸载或设备切换后忽略旧结果并停止后续批次，查询失败释放加载状态。此处不取消已发送 IPC，也不设置 HDC 命令超时。

应用名称优先取本地有效明文 label；否则在设备 `bm dump -h` 声明 `-l, --label` 时使用 `bm dump -n <bundle> -l` 解析资源名称。能力探测限定在单批请求，名称也不跨请求缓存；不支持或失败时保留原在线/包名回退。不能将应用的 apiTargetVersion 当设备版本。图标仍使用原在线策略，`$media:` 资源引用不能直接作为图片路径；当前未实现 HAP 资源解析。Application.tsx 列表插入名称与图片 URL 时做 HTML 转义。

## 状态与面板生命周期

- `src/renderer/main/store/index.ts` 是主窗口 MobX store，持有 targets、target、panel，以及 settings/application/process/layout 子 store。
- `src/main/lib/store.ts` 通过 Licia `FileStore` 存储用户数据目录下的 `data/main.json`、`settings.json`、`screencast.json`；目录路径由共享 `getUserDataPath()` 决定。
- `src/renderer/lib/util.ts` 的 `setMainStore()` 将 MobX observable 转为普通 JS 值后传过 IPC。
- `src/renderer/main/App.tsx` 使用 `components/workspace/Workspace.tsx` 提供分组侧栏、设备选择和公共页头；`workspace/Panel.tsx` 首次访问后保留子组件，隐藏时通过 visibility、inert 和 aria-hidden 隔离布局显示、焦点与辅助技术访问。隐藏不等于卸载；轮询仍需根据活动 panel 管理。应用级 settings 面板位于设备 key 边界外，设备变化不重建表单；设备初始化等待期间也可访问。
- store 保留八个既有设备 panel ID，并增加 settings；初始化和选择时将未知 ID 归一为 overview。`overview/Overview.tsx` 保留刷新代次隔离，已有详情刷新时仍显示，失败后清空并提供重试；字段复制按钮在未知值时禁用。
- 主面板容器和投屏组件都使用设备 key 参与重建。投屏 store 监听 `changeMainStore`：target 为 null 时关窗，换设备时销毁旧客户端并创建新客户端。
- `overview/PortMappingModal.tsx` 只在弹窗可见且有目标时读取映射；关闭/目标变更使旧读取失效，同一会话仅接受最后发起的当前方向结果。读取失败清空列表和选择并提示，恢复依赖手动刷新或重开；写入成功后的读取绑定原可见期，不取消已发送 IPC。
- `process/Process.tsx` 仅活动页轮询，按设备/请求序号隔离结果；停止确认绑定原设备/进程，刷新保留有效选择。`shell/Shell.tsx` 使用语义标签和命令弹窗，最后一个标签关闭后可新建；`Term.tsx` 用代次清理迟到的 create/reset 会话、释放输入订阅和尺寸观察，隐藏仅暂停显示而保留会话。
- `hilog/Hilog.tsx` 的打开/重启绑定代次，迟到会话关闭；暂停/恢复在 effect 中执行，隐藏页不接收记录。显示与导出缓冲采用 Luna 同一分批淘汰规则：到 11,000 条移除最早 1,000 条。筛选只影响显示；清除同步重算 Luna 显示缓存；重启沿用后端清空设备日志语义。右键复制取实际触发行的字面消息，避免淘汰后旧行索引错位。
- `layout/Layout.tsx` 根据页面可用宽度（1000px阈值）在三栏与树/预览双栏之间切换；紧凑属性抽屉只有一个 Detail 实例，紧凑 resize 不覆盖三项已保存 weights。刷新串行完成截图解码与 XML 解析，按设备会话丢弃迟到结果；LunaSplitPane 子元素先过滤空节点。xmldom0.9 已提供只读 children，不再写入该属性；节点变换只遍历元素。
- 布局预览在图片解码并设定 canvas 尺寸后挂载 image viewer，卸载清除 pointer/image 回调；树支持键盘选择，属性切换保留选中。WebView 保持活动页/目标双重检查、PID变更清选择，区分错误/无目标/无匹配，动作使用当前查询结果。
- 新增主面板通常需要同时修改 `App.tsx`、`components/workspace/Workspace.tsx`、store 中的 panel 白名单、语言字典，状态逻辑按需要放入 `store/`。

## 投屏与输入链路

```text
src/renderer/screencast/store.ts 创建 ScreencastClient(connectKey)
  → main.createCaptureSession(connectKey) 获取主进程生成的 token
  → main.startCaptureScreen(sessionId, scale, generation, preferVideo)
  → captureSessions.ts 校验原文档、按设备串行真实 stop/start
  → uitest.ts 单次初始化并缓存 CaptureUiDriver
  → CaptureUiDriver 优先 NativeVideo；不可用则 UiDriver JPEG
  → 回调经可释放 CaptureScope
  → 原 frame.send('captureScreen', sessionId, generation, image, metadata?)
  → H264Decoder/WebCodecs 或 JPEG loadImage → 共用 Canvas paint()

Canvas pointer 事件
  → getPointer() 计算设备坐标
  → main.touchDown / touchMove / touchUp
  → src/main/lib/hdc/uitest.ts → UiDriver
```

`getUiDriver()` 将资源 `uitestkit_sdk/uitest_agent_v1.1.0.so` 和版本 `1.1.0` 传给 CaptureUiDriver（继承真实 UiDriver）构造器，按设备缓存并合并并发初始化。资源版本与调用参数需要保持匹配。

`captureSessions.ts` 的每设备队列等待真实 UiDriver 操作完成，不因 renderer 消失或超时 race 提前放行。`CaptureUiDriver` 通过公共 on/off 精确管理自身捕获监听；关闭、导航、崩溃和 stop 请求立即本地退订，迟到启动完成后再补偿停止。stop 拒绝保留待确认 lease；前台下一 start 遇到明确控制传输错误时可尝试一次受限恢复，其他错误继续保留 lease。stop 的 stopped/released/obsolete 分别表示本 lease 停止已确认、仅释放无 lease token、旧 token 已失效，不能混称设备已停。`test/capture-sessions.test.cjs` 与 handler 回归保留真实依赖方法验证这些边界。

`hdc/controlRecovery.ts` 记录普通控制 daemon 的 PID 和 `/proc` starttime，恢复前先结束本应用原生流和控制连接；拒绝替换后的进程、其他原生捕获或 TCP 8012 活跃连接。只终止仍匹配的单个控制进程，并确认消失后才由 `UiDriver.clearStoppedCapture` 清除私有捕获回调，再重新初始化。每条恢复检查通过 `finiteShell` 限制为 5 秒；ps 及独立 IPv4/IPv6 表要求命令完成标记并校验数据行，部分读取不能证明无其他客户端。后台准备、普通输入、关闭窗口均不主动重置控制服务，未知结果输入不重放。SDK 检查结果必须有明确标记，错误或空输出不能被当作 SDK 缺失。初始 HDC shell/转发仍无统一截止，不能将上述预算外推为完整启动期限。

`ScreencastClient.subscribeState` 提供 loading/ready/failed；连续三次已结算启动仍无首图时停止自动重试，界面显示错误和“重试投屏”。手动重试重新计数，真实画面绘制才进入 ready；只有启动成功结算且已绘图才清零失败次数，预览后的启动拒绝仍计入失败并恢复 loading。组件销毁退订状态；此上限不能处理底层 Promise 永不结算的 HDC 准备阶段。验证见 `docs/maintenance/screencast-control-timeout.md`。

`CaptureUiDriver` 先用只读 `getDisplaySize` 准备控制服务，再启动本会话的实时 JPEG 预览，原生取流成功后才停止该 JPEG。首帧静止沉默继续沿用 JPEG；不会发送无归属的 JPEG stop。JPEG 尝试发出即标记可能活动，stop 失败继续保留状态；原生与 JPEG 的停止独立尝试。`hdckit/UiDriver` 控制 RPC 默认 10 秒、JPEG stop 回复 3 秒、TCP 连接 3 秒、Driver.create 1 秒截止；断开/超时/主动关闭拒绝全部等待、销毁旧 socket，下次调用重新握手。未知结果命令不自动重发，不把超时当作停止确认。HDC shell/SDK 准备尚未全部有限化，不能将 RPC 截止外推为整个启动链路的总时限。证据见 `docs/maintenance/screencast-first-frame-recovery.md` 和 `docs/maintenance/screencast-static-start.md`。

原生首帧判定排除配置包。首帧 5 秒沉默使用专门错误，先尝试有 2 秒截止的 onEnd，随后按原有所有权规则确认清理；本次直接沿用 JPEG，不再扫描其余库，也不删除已成功的兼容提示。renderer 在收到非配置视频但尚未绘制 H.264 时保留独立的 5 秒恢复条件，JPEG 预览不取消该等待；真实 H.264 绘制后丢弃迟到 JPEG。此策略保障首图，不保证静止固件能输出原生视频。

`nativeVideo.ts` 用现有 HDC 命令创建会话独占的原生扩展副本/进程/转发，以 Node 内置 HTTP/2 读 gRPC；`nativeVideoProtocol.ts` 负责 8 MiB 上限的消息拆包和 protobuf 字段。正式应用传入 `resources/native-video`，由 `nativeVideoResources.ts` 检查设备 ABI/UITest 版本及本地 ELF/SHA-256，再按清单上传候选库到随机会话名称、核对手机端 SHA-256 并启动；失败后确认清理才试下一个，通过 nativeVideoPreference.ts 在桌面持久化已成功候选提示，按设备、ABI、UITest、固件及资源清单隔离；缓存命中仍校验 ELF/哈希和实际握手，失效时清除并重探。不依赖或覆盖手机预装库，手机端不保留永久库缓存；仅未传资源目录的旧调用兼容原有库路径。停止优先调用 onEnd，再终止并核对本会话随机扩展名的进程，最后移除自己的转发和副本；HDC 错误或清理不确认时保留 lease。 `nativeVideoOwnership.ts` 在用户数据目录按 HDC endpoint/target 分隔持久化桌面 PID、设备 PID/starttime、随机扩展名及转发端口；前台控制初始化/恢复可原子认领已退出桌面进程的记录，校验设备身份后精确回收。后台不回收；发现待回收记录时跳过 native 预热，前台复用缓存/初始化中的 driver 仍回收。活跃桌面 PID、身份变化或清单不完整均拒绝；损坏 JSON/字段隔离保留，不授权远端清理且不阻塞其他合法记录，I/O 失败仍拒绝。停止确认后才清除记录。恢复删除转发前要求完整 Unix socket 表确认没有其他 native listener。旧版无记录残留及首次记录写入前的崩溃不能自动认领，详见 `docs/maintenance/screencast-orphan-recovery.md`。桌面无 Java 运行时。`H264Decoder.ts` 缓存 SPS/PPS、等待关键帧，解码队列积压时重建并等待下一关键帧；Canvas 只保留一个待绘制最新 VideoFrame，并关闭被替换的帧。缺失 WebCodecs 时请求 JPEG；视频流中断时每个 ScreencastClient 经原设备队列重连一次 H.264，再次流错误才单向回退 JPEG；真正解码失败仍立即回退，旧 generation 的错误被忽略。原生服务请求帧率为 120，实际速率受设备/内容限制，不能当作实际 120 FPS 承诺；同分辨率的当前设备帧率与中断恢复证据见 `docs/maintenance/screencast-fps-tuning.md`。准备、候选探测与流错误在主进程保留原因日志。新 driver 先用 initializeControl 验证和复用健康控制服务；生产 CaptureUiDriver 始终禁止 UiDriver 广域停止，初始恢复和 SDK 更新统一通过已记录 PID/starttime 的受限恢复。SDK检查识别新版`@v兼容版本#实际版本`标记；按主/次版本区分1.1 TCP与1.2 Unix协议族，同族较新补丁复用；无活动daemon时异族切换到随包agent，存在任何UITest PID且协议族不兼容时抛出不可自动恢复的错误，避免TCP保护遗漏外部Unix客户端。未知/冲突标记拒绝更新。后台初始化及缓存 driver 准备重连不重置已有 daemon。自己的新 daemon 启动不再固定 sleep，而以 3 秒预算尝试初始握手，普通输入不重放。连续两次确认候选扩展已退出时快速结束套接字等待，活进程继续等待。设备版本查询必须排在控制准备之后，以免短暂 uitest --version 进程干扰 pidof 判断。详见 docs/maintenance/screencast-start-latency.md。

`vendor/native-video/manifest.json` 固定官方 SDK 归档和六个 ARM64 候选库的版本、大小及哈希；`script/native-video-resources.mjs` 使用 Node 解压指定条目，`script/build.mjs` 只复制清单内原生库和来源/许可文件。构建和运行均不执行 Java，归档 JAR 不进入应用包。兼容范围与验收见 `docs/maintenance/native-video-deployment.md`。

`nativeVideoRecovery.ts` 补充跨电脑受限恢复：仅前台调用 `recoverOrphans(true)`，在本机 journal 清理后、无自身 standby/其他活跃本机记录时检查完整启动命令、清单内库哈希、PID/starttime、单个空闲视频 listener 与 IPv4/IPv6 控制连接。一秒后确认相同身份，设备端 shell 再核对后精确终止；不依赖旧电脑 journal、awk 或 `/proc/<pid>/fd` 权限，不清理其他主机转发。后台不触发，当前实例并发检查合并。只读预检异常仅跳过跨电脑接管，让健康控制/JPEG 仍可使用；终止命令及后续清理失败继续阻断。socket 表头同时接受 Linux 与 HarmonyOS 的 Protocol/Proto、St/State；未知状态拒绝。控制恢复先关闭自己的失效连接，避免把它误判为另一个客户端。shell 检查到 kill 仍有极短竞态，无 pidfd 原子保证；范围见 `docs/maintenance/windows-cross-host-capture.md`。

定位投屏问题时：

- 帧解码入口：`ScreencastClient.ts` 的 `videoFrame()` / `draw()`，共同进入 `paint()`；JPEG 只保留一张待解码最新帧。图像加载辅助在同目录 `util.ts`，视频解码在 `H264Decoder.ts`。性能与部署边界见 `docs/maintenance/screencast-video-design.md`。
- 触摸映射：`getPointer()` 先按帧宽高比算 CSS 容器内的实际图像区域，再按百分比映射到 `getDisplaySize()` 返回的设备尺寸。请求 `scale` 与实际流缩放可能不同。
- 首帧或帧尺寸变化时重新查询设备尺寸；尺寸必须是正整数。坐标上限为 width/height 减一。没有有效尺寸时不发送触摸。
- `isDrawing` 让绘制和尺寸查询串行进行，期间新帧会跳过；它不是帧队列。改动时注意异步旧帧覆盖新状态。
- 客户端用局部队列合并缩放，主进程提供跨 renderer 的设备顺序；帧须同时匹配 sessionId 与启动 generation。本次启动未出图或创建/start 拒绝后五秒重试，`ready` 只代表首次成功绘制。`destroy(): void` 清除重试、退订帧/指针监听、取消图片加载，并立即发送 session stop 以便主进程本地失效；创建回复迟到时也释放 token。不能撤销已发送的设备请求，永不返回时仍不能确认远端停止。
- `loadImage(url, signal?)` 清理图片处理器并支持取消；客户端在 finally 中释放 Blob URL。无设备生命周期回归见 `test/screencast-lifecycle.test.cjs`，真实捕获和原应用问题的验收边界见 `docs/maintenance/M2-3-recovery.md`。
- `src/renderer/screencast/components/Screencast.tsx` 等首帧 ready 后挂载 Canvas，并处理拖入 HAP；`lib/fitWindow.ts` 观察实际帧比例和容器尺寸，首帧/比例变化时通过 preload 的 `fitScreencast` 报告尺寸及实测窗口界面占用。主进程 `window/screencast.ts` 只接受当前投屏主文档，按当前窗口面积、画面比例和显示器可用 DIP 空间调整窗口；最大化/全屏保持不动。相同比例的帧、分辨率档位和普通手动缩放不反复调整窗口。Canvas 的 CSS 尺寸始终按比例计算，低分辨率画面也可填满适配后的窗口，触摸仍使用真实画面矩形。卸载时取消尺寸观察与待执行回调。同目录的 `Toolbar.tsx` 提供缩放、按键、PNG 导出、置顶和全屏；文本输入由画面键盘与粘贴处理。
- 工具栏默认隐藏，通过标题栏左侧「⋯」展开左对齐毛玻璃面板，点击「×」或工具区 Escape 收起并恢复入口焦点。入口经 React portal 挂到 body，避开视频容器裁剪；44×30 的 no-drag 唤起区域仅在标题栏内，macOS 向右避开交通灯。鼠标离开 2 秒后自动收起，返回取消计时；入口再空闲 2 秒隐藏，移入标题栏入口区域或键盘聚焦时显示。通过 portal 的 React 事件保持共同悬停/焦点逻辑，不再监听 document mousemove，不遮挡手机输入。键盘操作和选择框编辑期间暂停，操作结束后重新计时，卸载清理计时器及 portal。视频不为工具栏留空，面板展开/换行不改变视频容器尺寸；浮层空白处不拦截 Canvas 输入。面板保留挂载。
- 工具栏面板与入口使用 160ms opacity 过渡；面板收起时立即设 inert/aria-hidden 并禁用指针，淡出结束后 CSS visibility 隐藏，不用 display:none 截断动画。快速反向切换由 CSS 接续当前透明度，减少动态效果偏好下取消过渡。
- 画质只提供原画（scale=1）和流畅（scale=0.5），不承诺固定FPS；选择框保留原生语义，使用可样式化picker统一毛玻璃外观。screencast/store.ts在初始化捕获前按原生整数缩放档位兼容旧比例（0.5/0.6→0.5，0.7～1→1），非法值默认原画；切换只保存规范值，同档位不重启。
- ScreencastClient.getCaptureStats返回当前generation的成功Canvas绘制计数和实际格式，start/destroy清空。Toolbar仅展开时按1秒interval与performance.now差值计算FPS，generation改变/未出帧显示等待或破折号，无新增帧归零；收起/卸载清理interval。它不是编码目标或显示器呈现速率，无额外设备采集/IPC或逐帧React更新。状态和画质成组换行，控件统一28px垂直居中；选择框禁用Luna旧三角，仅使用单个可样式化picker箭头。
- 工具栏已移除 T 文本输入按钮、prompt 和等待状态，专用 `inputText` IPC/类型/preload 桥接也已删除；文本统一由局部键盘与 `screencastInput` 会话接口发送。`test/text-input-toolbar.test.cjs` 保留工具栏显隐、焦点和 FPS 回归，原弹窗相关用例随已删除功能移除。
- `ScreencastInput.ts` 在 Canvas 同容器挂载局部 textarea，获得焦点后接收 IME/键盘及原生 paste 事件，失焦、重新点击、失败和销毁时清理待发送内容。`ScreencastClient.input` 经 `screencastInput(sessionId, action)` 桥接；`captureSessions.withCaptureInput/withCaptureTouch` 校验当前文档与会话，触摸和文本串行，关闭/重启中止有限 shell 等待。输入队列上限 64，释放触摸不因满队列丢弃。`hdc/screencastInput.ts` 安全编码文本（UTF-8 64 KiB 上限、拒绝 NUL），按键校验后用 `uinput -K`，10 秒截止/错误检测且不重放。输入 IPC 直接注册以避免通用参数日志记录文本。
- Ctrl/Cmd+C/X 在手机内复制/剪切时只读电脑剪贴板快照，设备操作成功后标记手机来源；Ctrl/Cmd+V 在同一队列中自动选择手机内容，电脑剪贴板文本与快照不同则切回电脑文本。快照读取有 1.5 秒截止，焦点代次失效立即结束等待，迟到结果不改变路由。原生 paste 事件共用逻辑，键盘快捷键直接读取以支持电脑空剪贴板。右键菜单可复制、剪切、自动粘贴或显式选择电脑/手机来源；右键按下保留 textarea 焦点，取消菜单后仍可打字。旧 Shift+V 保留为手机粘贴兼容入口。没有后台轮询、桌面剪贴板写入或跨会话持久化；实体手机复制、电脑重复复制相同文本无法从快照检测，菜单可手动选择。当前仍不支持手机到电脑复制。
- 捕获 lease 记录已派发触摸的最后位置；关闭或换代时即使普通队列中的 touchUp 已失效，仍在真实 stop 前补发释放。释放失败保留 lease 并阻止替换捕获，后续清理可重试。`screencastEdit.ts` 将原生菜单的 selectAll/delete 通过主进程→renderer `screencastEdit` 事件交给投屏处理；键盘接管焦点时转发到手机，否则保留本地输入框编辑。其他窗口仍用 Electron 原生编辑。
- 全屏请求作用于 Canvas 的父容器，以保留 textarea 输入焦点；全屏只跳过窗口尺寸适配，仍更新 Canvas CSS 尺寸。验收与限制见 `docs/maintenance/screencast-input.md`。

## UI 和生成文件

- 使用 React 函数组件、`mobx-react-lite` 的 `observer`、Luna React 封装和局部 `.module.scss`；CSS Modules 配置为 `camelCaseOnly`。
- 主窗口门户反馈使用普通 `workspace/MainFeedback.scss`，由 `html[data-workspace-window='true']` 限定样式与主题；不要改成未消费导出的 CSS Module 副作用导入，生产构建可能移除这些规则。`script/check-main-feedback.cjs` 验证构建后的实际通知样式与作用域隔离。
- `src/common/util.ts` 注册独立 `en-US` / `zh-CN` 业务词典，与 `src/share/common/langs` 合并；`t()` 在缺词时兜底英文，未知 key 原样显示。主进程启动解析已保存/系统语言；renderer 在页面懒加载前同步 i18n、HTML lang 和 LunaModal。设置页语言保存后由用户重启生效，包含菜单和各窗口。开发步骤与检查器边界见[国际化开发流程](internationalization.md)。
- `src/main/lib/SettingsStore.ts` 为低频 settings.json 保留 Store 的 get/set/change 接口，使用同步临时文件替换，在设置 IPC 返回前完成落盘，保证立即重启可读取。主窗口/投屏状态仍用 FileStore 防抖写盘。持久化回归在 `test/settings-persistence.test.cjs`。
- 1.0.5 主窗口语义 token 集中在 `workspace/Workspace.module.scss`，由 workspace 根的 data-theme 选择；主窗口拥有的反馈由 `useMainFeedback` 加显式作用域。关于、应用日志和 Electron 进程管理器使用 `share/renderer/tool-window/` 局部 token；不向独立投屏/升级窗口或共享全局主题扩散。旧主 Toolbar/Tabs/Target/SettingsModal 已由工作台、DeviceSwitcher 与独立设置页替代。主窗口原生选择框统一使用 `workspace/SelectControl` 的 SVG 箭头与留白，设备摘要复用同一箭头；保留原生键盘和下拉行为。
- 本地 Luna DataGrid 的可选 `rowHeight` 同步 CSS 与虚拟滚动位置；默认 20px 保持兼容，应用列表显式用 32px，调试列表和独立进程工具用 28px。不能只改行 CSS 高度。
- 独立进程工具的 store 由窗口组件显式启动/停止轮询，图表忽略卸载后的采样；应用日志卸载时取消 addLog 订阅和 resize 监听，忽略迟到的初始日志。
- 共享主题源是 `src/common/theme.json`，`npm run gen:theme` 生成 `src/renderer/theme.scss` 与 `src/common/theme.ts`。
- 图标配置是 `src/renderer/icon.json`，图标源在本仓 `src/renderer/icon`，`npm run gen:icon` 生成 `src/renderer/icon.css`。
- Prettier 配置为无分号、单引号、80 列；避免为局部任务运行全仓库重写格式。

## 投屏后台准备与退出

`main/index.ts` 在 HDC 初始化后启动 `lib/screencastPreparation.ts`，监听已有主窗口/投屏 store 和 HDC 的内部 `deviceEvents`（列举、add/remove）。`hdc/captureWarmup.ts` 只对选中且在线设备每代准备一次，待用服务 TTL 为 60 秒；选择变化、断连和退出使代次失效，不循环预热，无新增 renderer IPC。

`captureSessions.prepareCapture` 与前台 start/stop 共用设备队列，记录待用资源的 owner/ready 状态；点击在准备后原子转移到 capture lease，取消/过期不得停止已接管的流，清理未确认则阻止再启动。`NativeVideo.prepare` 只校验/上传/加载候选和建立转发，不发 onStart；每个候选部署前重新核对 socket 占用，监听就绪、准备完成和正式 start 均核对本会话扩展进程仍存在后取流，尺寸不匹配重建。监听成功只记内存提示，真实流成功才持久化兼容提示。控制初始化必须先于 UITest 版本探测。

退出处理立即取消预热并调用 shutdownCaptures 撤销帧路由，等待两者全部结算后允许可选 HDC shutdown。共享 relaunch 使用 app.quit 参与清理，主窗口 before-quit 后不因投屏可见而隐藏阻断退出。控制 HDC 准备尚无统一总截止，因此退出最多等待 10 秒，超时记录清理未确认并 app.exit 真正终止进程，避免迟到任务继续部署；远端资源或外部 HDC 子进程可能遗留，不宣称清理成功。证据见 docs/maintenance/screencast-pr56-review.md。

跨电脑终止前脚本使用设备 `flock` 串行化恢复，锁文件固定保留防止 inode 分裂；Harmony shell 以 stdin 继承锁（所有 read 使用 here-doc）。不支持 flock 或锁忙时跳过接管，已被其他恢复移除则不重复清理。原生客户端未参与该锁，连接与信号之间仍有短竞态。

## Agent 自动化服务与 CLI

`src/main/automation/profile.ts` 在主入口最先配置产品名和显式 profile，必须早于 store 和单实例锁。`src/main/index.ts` 在设备初始化后建立 `runtime.ts`/`service.ts`/`server.ts`，`lifecycle.ts` 负责启动中退出和正常关闭。GUI IPC 仍保持既有校验，自动化只通过已注册 schema 调用；已开放状态、发现、会话 lease、截图和输入。`controller.ts`/`sessions.ts` 共享 GUI 与自动化 owner；窗口通过注入的 hooks 保留 sender 检查，GUI 关窗若有 lease 则隐藏；实际销毁才释放。`frameBridge.ts` 仅向已注册当前 mainFrame 请求画布截图，renderer `AutomationFrameSource.ts` 记录真实呈现序号/时间，`frames.ts` 保留已导出引用与动作后屏障。Android/Harmony 输入进入同设备门禁，Harmony trusted API 绑定真实捕获 lease；不伪造 IPC event。`wire.ts` 的有界二进制响应由 CLI 原子落盘。`src/common/automation/` 为机器契约及能力，`src/cli/` 复用鉴权传输但不加载设备库。`script/build-cli.mjs` 生成独立客户端包，`script/build.mjs` 纳入该步骤。当前范围与定位见 [维护记录](../../../../docs/maintenance/agent-automation.md)。

自动化 Harmony 工具通过 `DeviceOperationContext` 把目标和有限 shell/host 调用传给原 hdc/bundle/base 业务函数。查询不另写解析器，apps.info 仅读设备元数据；应用写操作核对退出/成功标记，不自动重试。`hdc/hostCommand.ts` 使用参数数组、显式 endpoint/target 和有界子进程清理；`automation/adapters/installSource.ts` 从验证过的文件描述符创建私有 HAP 暂存。GUI 未传 context 时保留原业务路径。

`installSource.ts` 返回设备结果 value 与独立 cleanupConfirmed，清理异常不覆盖设备结果；harmonyTools 将确认安装和清理状态分别交付。`sessions.ts` 按 leaseId 保留释放记录至少五分钟，并在后台关闭未结束时拒绝新 owner/操作授权。GUI 遥控器键仍经过统一输入门禁，保留既有方向、确定及应用切换键码。

`CaptureScope.signal` 在 dispose 时取消原生视频启动/升档，传入 `NativeVideo.start` 与 `connectNativeVideo`；取消首帧等待仍走 onEnd 和 owned 资源清理。首帧已成功时取消监听不得抢先销毁返回的 stream。`SCRCPY_PLUS_CAPTURE_TRACE=1` 可启用 close/队列、首帧、onEnd、资源回收的时间点日志，默认关闭，不包含设备标识、命令、画面或原始错误；单设备隔离复现便于对应阶段。`onEnd-ended` 仅表示等待结束，必须看到 cleanup/close confirmed 才能确认释放。

自动化 Harmony 工具：`automation/adapters/harmonyTools.ts` 固定设备并注入 `DeviceOperationContext`；共享 hdc/{base,bundle,port,uitest,hilog} 业务接收显式 context。`hostCommand.ts` 管理单次 HDC 子进程，`layoutXml.ts` 有界 XML，`oneShotShell.ts` 退出标记与输出截断；日志/布局通过 blob 二进制响应交由客户端写文件。

`src/mcp/index.ts` 是独立 Node stdio 适配器，共用 automation/protocol 注册表、CLI client/profile，经同profile服务调用。`script/build-cli.mjs` 同时打包CLI和MCP，包含SDK依赖及许可；不在Electron主进程启动MCP。

自动化坐标校验延伸到派发点：AndroidMirror.input 的内部 expectedGeometry 由 nativeMirrors.inputBackend 绑定原截图尺寸，设备队列执行时再核对，释放不受新几何阻断；Harmony adapter 接受缩放但检查图像方向/比例，并在非释放触摸前有界读取实际尺寸。GUI IPC不接收expectedGeometry，自动化不伪造GUI sender。

原生投屏失败的 `MirrorSession/NativeMirrorInfo.connectionIssue` 为固定分类，不承载原始异常：Android ACCESS/BUSY通过nativeMirrorState/info IPC给renderer双语提示；重试/恢复清除。直接 USB 仍由后端独占，不自动 detach 其他 ADB；认证前 ACCESS/BUSY 可经 `devices/androidServer.ts` 复用已运行的本机 ADB，按 USB 序列号匹配并固定 transport ID，关闭只回收自己的 socket。共享window.ts的延迟位置保存及ready兜底必须先核对窗口存活。真实Codex宿主探针为 `script/check-automation-codex.mjs`，其结果与SDK模拟测试分开。

投屏来源的 `claimGui` 回调在仅聚焦现有窗口时声明 GUI 所有权，不重启后端，也不显示合并视图中隐藏的来源窗口；自动化最后一个 lease 释放不会关闭用户已接管的会话。Android 临时概览连接单独保留清理所有权，关闭失败后必须重试释放，其他读取或投屏连接才能再次取得 USB。

## iOS USB WDA / ReplayKit

USB iOS 的 `ios:<UDID>` 与 `ios:airplay-receiver` 分开。`ios-usbmux.connectIos` 每次用 UDID 查找当前 USB DeviceID，返回暂停且保留尾随数据的 socket。`ios-wda.WdaClient` 用独立 USB socket 发送有界 HTTP 请求，不重试写入；`ios.IosMirror` 管理专用 WDA session、PNG 预览与逻辑点输入；`ios-video.IosVideo` 管理自有 capture ID 和 scrcpy H.264 数据流，不停止全局广播。

`NativeMirrors` 新建 USB iOS 会话默认请求视频；首张 PNG 建立几何后通过共享输入队列开启 ReplayKit。同一窗口重连保留用户模式选择，默认视频失败仅在后端确认清理完成且恢复 PNG 后保留截图回退。

`nativeMirrorVideo` 为单一窗口 owner 可调用的布尔 IPC，通过原自动化输入队列互斥；`NativeMirrorFrame.format=png` 与 H.264 共用 FrameGate。USB GUI 输入附 `display`（实际显示的尺寸/方向）；自动化走完整批次 `iosInput`，不模拟 GUI pointer 事件。`AutomationFrameSource` 保留方向用于拒绝过期坐标。AirPlay 不提供输入。源码构建脚本与使用限制见 [USB 文档](../../../../docs/scrcpy-plus/ios-usb-wda.md)。

USB iOS 原生投屏的运行画面与 Android 共用无内边距布局，不常驻设备名/连接状态。`native-mirror/Toolbar.tsx` 复用 Harmony 的浮层样式，以标题栏右侧 portal 调节图标作为常驻入口，收纳 Home、视频切换、模式和录屏提示；展开不改变 Canvas 布局或窗口 fit inset。错误/断连提示仍保留。

原生交互式投屏的连接中/失败/断连提示采用绝对定位浮层，不参与 Canvas fit inset；断连旧帧变暗。iOS 只读观察最多连续失败三次后停止，恢复不重放写入。旧 WDA session 清理失败时，必须由 GET status 确认 ready 且旧 session 已消失后才能释放归属，无法确认则继续保留失败。


USB iOS GUI 的 `NativeInputFlow` 在 renderer 保持一个在途输入 IPC，合并待发 wheel/move、保留 up/cancel；不允许前一个 release 未完成即开始新手势，失败丢弃队列且不重放。无 display metadata 仍允许释放。输入错误为不改变布局的底部提示；`nativeMirrorOpen(restart?: boolean)` 仅窗口 owner 可显式重建，先置 disconnected 废弃旧输入队列，再等待后端清理并打开；renderer 在连接状态换代时重建输入流，不能在 open Promise 返回时再次替换已承载手势的流。PNG 异步解码和 H.264 回调绑定连接 generation，旧回调不能绘制或发布新的帧元数据。

`native-mirror/StatusCard.tsx` 统一连接状态的图标、标题、说明、可折叠准备清单和重试按钮；断连状态优先于输入错误展示，避免重复提示。深浅主题和窄窗口样式仍使用 SCSS Modules，状态与工具面板均不改变 Canvas 几何。


成功的 iOS 发现结果由 `devices/index` 交给 `nativeMirrors.reconcileIos`。USB 缺席不销毁窗口，保留 cleanup 所有权；同一 ready device key 重现后串行关闭旧后端、重开并按之前模式恢复视频（共享输入队列）。旧后端迟到的 frame/state 不得更新新会话，关闭后的窗口不得因发现事件复活。视频 stop 失败必须由 ready + standalone GET 确认精确 capture ID 不存在，不能凭 404 或换了 WDA session 就假定资源已清理。自动化 connected 恢复只解除 error/disconnected 至 starting，仍等待新的 renderer presentation；renderer 同步重置失败输入流。

USB iPhone 概览由 `devices/ios-usbmux.getIosOverview` 处理，仅通过 lockdown 获取固定字段，8 秒总超时，和 WDA/投屏生命周期独立。Store 恢复和选择允许 USB iPhone，Android/iOS 的鸿蒙专用导航均禁用；实际未返回的字段显示未知，不猜测硬件参数。

USB iOS 曾经连接成功后，即使 USB 发现始终在线，后端 disconnected/error 也标记 reconnectPending；设备轮询串行重建并保留 videoRequested。首次 WDA 准备失败不自动重复创建会话。该路径恢复客户端会话，不负责启动或签名 WDA Runner。

WDA 使用固定源码加 `vendor/ios-wda/session-ownership.patch`：串行 session 创建入口原子拒绝已有会话，status 返回协议版本及进程 UUID，创建请求绑定该 UUID。`ios-ownership.WdaAllocation` 在分配请求发送前记录未知结果；响应丢失时 close 保留归属，只有 ready 的新 Runner UUID 可证明原资源已消失，不通过猜测 ID 删除资源。旧 Runner 被明确拒绝。`IosMirror.report` 在 disconnected/error 统一取消本代 GUI 输入，包括视频关闭和截图回退失败；每个 GUI 操作入队时捕获取消信号。
