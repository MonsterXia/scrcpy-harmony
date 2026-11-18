# Scrcpy Plus 品牌图标（2026-11-18）

## 范围与实现

用户确认浅色、深色、单色方案并授权制作正式资源、替换旧图标及适配 macOS 系统外观。统一矢量母版保留双屏和加号，在所有外观使用相同的交叠留缝。静态 PNG/ICO、应用内 PNG 和原生 `.icon` 分层由 `script/generate-app-icons.mjs` 一起生成，无新增依赖。

关于窗口随已有 MobX 主题切换；更新窗口使用与其背景一致的 `prefers-color-scheme`，通过 picture 选择图标。关于窗口旧的“鸿蒙设备桌面工具”说明同步改为中英文三端投屏说明。

`node script/compile-mac-app-icon.mjs` 用 actool 编译分层源。已验证的 Assets.car 和 ICNS 存放在 `build/mac-icon/`。打包在签名前嵌入两份资源并设置 `CFBundleIconName=Icon`，编译后同时生成整套图标的哈希清单。构建前校验源文件，复制后校验 renderer 输入与 dist 中的打包资源，CI 从 DMG 安装后按字节比对两份原生资源。首次 PR CI 中 Xcode 26.3 的 AssetCatalogAgent 在编译时退出，因此改为在资源生成阶段编译。资源编译进程自动寻找 Xcode 26+；尊重显式 `DEVELOPER_DIR`，不修改全局 xcode-select。背景/前景原生外观由系统管理，没有用 `app.dock.setIcon` 覆盖系统图标，也不会因用户强制应用窗口深浅色而覆盖系统图标风格。

macOS 的系统窗口外观和“图标与小组件样式”是独立设置。支持系统默认、深色、透明与着色外观及相应自动策略，不强制把用户选定的默认图标改成深色。旧系统保留静态 ICNS；Windows 使用 16/24/32/48/64/128/256 多尺寸 ICO。

## 验证

[验证汇总与源码/产物哈希](../design/scrcpy-plus-icon/verification/summary.json)。

- 完整 `npm run build`、lint/i18n、macOS arm64 打包及签名完整性检查通过。
- [应用内与静态资源](../design/scrcpy-plus-icon/verification/ui-and-assets.json)：真实 Electron 45 加载生产 renderer；模拟主题/语言 IPC，不连接手机。中英文、关于/更新窗口、浅→深→浅共 12 项。验证 PNG 为 1024 × 1024、外部杂点为 0、三版 alpha 哈希一致；ICO 七种尺寸与 PNG 数据有效。
- [macOS 原生](../design/scrcpy-plus-icon/verification/macos.json)：包内含 Aqua、DarkAqua、Tintable 外观、IconImageStack、传统 ICNS；Icon Composer 原生渲染 macOS 26/27 各六种外观，分别保存实际输出。此项为 CLI 原生渲染；后续另完成下述已安装应用的真实系统外观切换。
- 本机候选 `release/app-icon-20261118/mac-arm64/Scrcpy Plus.app` 的隔离配置启动检查通过；本地 ad-hoc 签名，不代表本轮已完成 Developer ID 公证或公开分发。
- [正式图标与小尺寸预览](../design/scrcpy-plus-icon/verification/formal-icons.png)；本轮未做 Windows 安装、旧 macOS 运行、真机投屏矩阵。

## 本地安装与实际系统切换

用户后续明确要求更新本地安装，并授权使用 `screencapture` 保存 Dock 验证截图。已将候选安装到 `/Applications/Scrcpy Plus.app`，原应用保存在 `release/app-icon-20261118/local-install-backup/`。安装后 `codesign --verify --deep --strict` 与隔离启动 smoke 通过；安装资源 `Assets.car` SHA-256 与候选一致。已实际启动安装版，保留运行；其他工作区正在使用的投屏实例未退出。

在本机 macOS 27.2.1 上通过系统设置切换并观察：

- “图标与小组件样式 → 深色 → 自动”下，系统浅色 → 深色 → 浅色时，Dock 和 Finder 图标均同步切换，无需重启应用、Finder 或清理图标缓存。
- 退出安装版后，Finder 的深色 → 浅色切换仍有效，确认使用包内原生资源。
- 深色样式的“始终”显示深色；着色样式显示清晰的同色双屏与加号轮廓。系统着色颜色由用户的系统设置决定，并非固定使用石墨色 PNG。
- Finder 通过实际窗口检查，Dock 在外接显示器通过系统截图检查。[现场记录](../design/scrcpy-plus-icon/verification/live-system.json)列出结果和本地截图校验值。原始截图仅用于本地验收，验收结束后已清理。

验证结束已恢复原设置：系统外观“自动”、图标样式“默认”，深色样式的原“始终”选项也已还原；Dock 底部/不自动隐藏设置未改动。若日常希望图标跟随系统深浅色，应在系统设置 → 外观 → 图标与小组件样式选“深色 → 自动”。“默认”图标样式不会因为窗口进入深色而自动变为深色图标。

## 验证程序修复

首轮临时 Electron 验证入口缺少对象闭合括号，产生用户截图中的 `plus-icon-ui-*/main.cjs` 主进程 SyntaxError。已修复，并增加启动前 `vm.Script` 语法校验与 30 秒启动超时。失败测试进程已退出，随后重新运行通过。这不是正式应用入口的业务崩溃。

另修复验证工具两个假失败：Playwright 默认强制浅色导致 CSS 不响应 `nativeTheme`，已用 `colorScheme: null` 验证真实传播；自定义打包目录启动检查误对照旧签名库，已让 pack 与 smoke 共用 `SCRCPY_PLUS_PACK_OUTPUT`。

## 复现与下一步

```sh
npm run gen:app-icons # 作者机器需 Chrome，或设置 BROWSER_EXECUTABLE
node script/compile-mac-app-icon.mjs # 更改图标分层后在 Mac 上重新编译
npm run build
npm run lint
node script/check-app-icon-ui.mjs
SCRCPY_PLUS_PACK_OUTPUT="$PWD/release/app-icon-20261118" npm run pack -- --no-publish --adhoc-sign
node script/check-macos-app-icon.mjs 'release/app-icon-20261118/mac-arm64/Scrcpy Plus.app'
SCRCPY_PLUS_PACK_OUTPUT="$PWD/release/app-icon-20261118" node script/smoke-app.mjs "$PWD/release/app-icon-20261118/mac-arm64/Scrcpy Plus.app/Contents/MacOS/Scrcpy Plus"
```

生成资源已跟踪，普通构建无需 Chrome；重新编译原生图标需要完整 Xcode 26+，单独导出 26/27 两代渲染图的检查使用 Xcode 27 Icon Composer。当前源码、候选包和日常安装均已替换图标，Dock/Finder 实际切换已验证；其他工作区运行中的试用包保持原状。Windows 安装、旧系统回退及全局透明样式仍需另验。对外分发仍重新签名、公证；历史公证票据不适用于新包。
