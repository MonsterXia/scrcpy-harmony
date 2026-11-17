# Scrcpy Plus 仓库与更新源迁移（2026-11-17）

用户确认 Plus 为当前项目的正式延续，授权直接改名、调整更新路径并验证；随后明确允许旧 Harmony 无法检测 Plus，由用户手动重新安装，不引入旧仓库解析或配置迁移代码。

## 已实施

- GitHub 仓库 `MonsterXia/scrcpy-harmony` 改名为 `MonsterXia/scrcpy-plus`，ID 保持 `1426959270`，默认分支仍为 `master`。保留提交、tag、Release 和附件；同步远端项目说明、主页和本地 origin。
- `package.json.publish` 集中维护 GitHub owner/repo，生产 ReleaseProvider、网页回退解析器和打包配置共同读取。主页、Issues、README 克隆/下载链接和当前构建指南使用新地址。
- 恢复“检查更新”和预发布菜单。仍为检查元数据后打开指定 Release 手动安装；不自动下载/安装，不允许降级。Windows/Mac ARM 使用 latest，Mac Intel 使用 latest-x64。
- 打包默认不发布，只有显式 `npm run pack -- --publish` 才上传，`--no-publish` 优先。构建 workflow 继续只产生 artifact。
- `npm start` 改为 `electron . --inspect=9229`，从根包入口加载相同 dist 主进程，避免开发模式检查更新时误把 Electron 运行时版本当作产品版本。
- 不改 `io.scrcpyplus.desktop`、Plus 配置目录或工作区版本 `1.0.5-dev.1`。线上已有 `1.0.5-dev.2`，此次不覆盖现有 tag/附件、不新建发行版。
- 旧 Harmony 手动安装 Plus；不做自动配置迁移。GitHub 自身重定向继续可用，但不保证已发布旧客户端的网页回退。历史发行证据、旧安装器测试及内置图标字体名保留原名。

## 验证

- 测试先红：新源路径、网页解析及启用菜单共出现 13 个预期失败；改动后定向 48 项通过；补充打包边界后更新相关 52 项全部通过。
- `npm test`：应用 1149 pass / 2 skip；Licia 生产和 fallback 各 606 passing / 4 pending。后续补充 4 项打包测试并调整共享初始化 channel 后，定向 52 项重验通过。
- `npm run lint` / i18n 通过；完整 `npm run build` 通过。Vite 转译不代表完整 TypeScript 类型检查。
- 改名前后 GitHub API 返回相同仓库 ID；新 origin 的 `git ls-remote` 成功。旧 Releases URL 返回 301 到新 URL，旧仓库 API 返回新 full_name。
- 真实新 Releases HTML 经生产解析器成功读取 6 个历史/当前版本。
- [线上 provider 报告](scrcpy-plus-rename/online-provider.json)：三平台 × 稳定/预发布共 6 组真实网络查询与下载 URL 解析通过。稳定选到历史 `1.0.4` 且不提示降级；预发布选到 Plus `1.0.5-dev.2` 并提示更新。该检查运行在 macOS Node，模拟目标平台元数据选择，不代表 Windows/Intel 安装验收。
- [Electron 双语更新窗口验收](scrcpy-plus-rename/electron-ui.json)通过：真实生产主进程/preload/React、真实 GitHub 查询，隔离配置中启用 Beta，发现 `1.0.5-dev.2`；点击下载按钮捕获并断言新仓库的精确 tag URL（只替换 shell.openExternal，避免打开外部浏览器）。已检查双语截图。首轮探针误用 `/update/` 匹配实际 `?page=update`，第二轮仍读到 checking 后改为显式 IPC 轮询，第三轮直接启动 JS 文件使 Electron 使用运行时版本而返回 unavailable，定位到原 npm start 也存在该问题；先以完整 dist 应用入口通过，再将开发启动改为根包入口并完成中英文重验，实际版本均确认为 `1.0.5-dev.1`，通过全部断言。三个失败报告保留供审计；只修正开发启动命令，不添加旧 Harmony 兼容分支。

## 交付边界与下一步

本轮源码变更保留在当前工作区，未提交/推送，未替换本机已安装应用。仓库改名及远端说明/主页已生效。工作区原有 iOS 开发改动保持不动。后续通过正常 PR/CI 交付新源码，发布时使用更高版本号并分别验证目标平台安装包；旧客户端需要手动安装包含本次修复的新版本。
