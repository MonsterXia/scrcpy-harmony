# Scrcpy Plus 仓库与更新源迁移（2026-11-17）

用户确认 Plus 为当前项目的正式延续，授权直接改名、调整更新路径并验证；随后明确允许旧 Harmony 无法检测 Plus，由用户手动重新安装，不引入旧仓库解析或配置迁移代码。

## 已实施

- GitHub 仓库 `MonsterXia/scrcpy-harmony` 改名为 `MonsterXia/scrcpy-plus`，ID 保持 `1426959270`，默认分支仍为 `master`。保留提交、tag、Release 和附件；同步远端项目说明、主页和本地 origin。
- `package.json.publish` 集中维护 GitHub owner/repo，生产 ReleaseProvider、网页回退解析器和打包配置共同读取。主页、Issues、README 克隆/下载链接和当前构建指南使用新地址。
- 恢复“检查更新”和预发布菜单。仍为检查元数据后打开指定 Release 手动安装；不自动下载/安装，不允许降级。Windows/Mac ARM 使用 latest，Mac Intel 使用 latest-x64。
- 打包默认不发布，只有显式 `npm run pack -- --publish` 才上传，`--no-publish` 优先。构建 workflow 继续只产生 artifact。
- `npm start` 改为 `electron . --inspect=9229`，从根包入口加载相同 dist 主进程，避免开发模式检查更新时误把 Electron 运行时版本当作产品版本。
- 不改 `io.scrcpyplus.desktop` 或 Plus 配置目录。原工作区验证使用 `1.0.5-dev.1`，本次独立 PR 保留 master 的 `1.0.5-dev.2`；不覆盖现有 tag/附件、不新建发行版。
- 旧 Harmony 手动安装 Plus；不做自动配置迁移。GitHub 自身重定向继续可用，但不保证已发布旧客户端的网页回退。历史发行证据、旧安装器测试及内置图标字体名保留原名。

## 原工作区验证（1.0.5-dev.1）

- 测试先红：新源路径、网页解析及启用菜单共出现 13 个预期失败；改动后定向 48 项通过；补充打包边界后更新相关 52 项全部通过。
- `npm test`：应用 1149 pass / 2 skip；Licia 生产和 fallback 各 606 passing / 4 pending。后续补充 4 项打包测试并调整共享初始化 channel 后，定向 52 项重验通过。
- `npm run lint` / i18n 通过；完整 `npm run build` 通过。Vite 转译不代表完整 TypeScript 类型检查。
- 改名前后 GitHub API 返回相同仓库 ID；新 origin 的 `git ls-remote` 成功。旧 Releases URL 返回 301 到新 URL，旧仓库 API 返回新 full_name。
- 真实新 Releases HTML 经生产解析器成功读取 6 个历史/当前版本。
- [线上 provider 报告](scrcpy-plus-rename/online-provider.json)：三平台 × 稳定/预发布共 6 组真实网络查询与下载 URL 解析通过。稳定选到历史 `1.0.4` 且不提示降级；预发布选到 Plus `1.0.5-dev.2` 并提示更新。该检查运行在 macOS Node，模拟目标平台元数据选择，不代表 Windows/Intel 安装验收。
- [Electron 双语更新窗口验收](scrcpy-plus-rename/electron-ui.json)通过：真实生产主进程/preload/React、真实 GitHub 查询，隔离配置中启用 Beta，发现 `1.0.5-dev.2`；点击下载按钮捕获并断言新仓库的精确 tag URL（只替换 shell.openExternal，避免打开外部浏览器）。已检查双语截图。首轮探针误用 `/update/` 匹配实际 `?page=update`，第二轮仍读到 checking 后改为显式 IPC 轮询，第三轮直接启动 JS 文件使 Electron 使用运行时版本而返回 unavailable，定位到原 npm start 也存在该问题；先以完整 dist 应用入口通过，再将开发启动改为根包入口并完成中英文重验，实际版本均确认为 `1.0.5-dev.1`，通过全部断言。三个失败报告保留供审计；只修正开发启动命令，不添加旧 Harmony 兼容分支。

## 交付边界与下一步

原工作区阶段未提交/推送或替换安装版。用户随后授权仅提取本迁移变更，独立 PR 经审查与 CI 通过后合入。已从最新 master `e4f01c9` 建立独立 worktree/分支 `codex/scrcpy-plus-rename`，保留 master 的 `1.0.5-dev.2` 版本及已合入的 iOS 代码；本次 diff 不包含任何 iOS 实现。原工作区的其他改动保持原样。

独立分支 `1423983`：`npm test` 为应用 1163 pass / 2 skip，Licia 两模式各 606 passing / 4 pending；lint/i18n 通过。独立审查另外执行更新定向 52 项全部通过，无 Critical/Important；版本证据措辞的 Minor 已澄清。本轮只修改迁移配置、逻辑、测试及记录，未改 iOS 实现文件。

交付为 [PR #93](https://github.com/MonsterXia/scrcpy-plus/pull/93)，最终审查、五项必需 CI 和合并状态以该 PR 为准；使用正常分支保护合入，不绕过检查。合入不代表发布新版本或更新本机安装。

## PR 自动审查修复与历史验收边界

Sourcery 指出原线上脚本只记录版本、未断言选中结果。已改为必需显式提供 stable/prerelease 的 version 和 updateAvailable，并对三平台六场景分别断言。新增4项实际脚本测试证明正确预期通过、错版本/错可用性/缺预期均失败（先红3项，再绿4项）。独立复核无新增问题；修复后全量应用 1167 pass / 2 skip，Licia 两模式各606/4。[独立分支线上六场景](scrcpy-plus-rename/online-provider-dev2.json)按 [显式预期](scrcpy-plus-rename/expected-dev2.json)全部通过；当前 dev.2 对历史稳定版与同版本预发布均不提示升级。

初轮仅修改历史 `update-acceptance.yml` 的下载地址触发了固定 Harmony 1.0.1/1.0.2 验收。[该次 mac-arm64 失败日志](https://github.com/MonsterXia/scrcpy-plus/actions/runs/44011194858/job/133798334791)显示 `check-packaged-update.mjs:93` 的旧 metadataUrl 请求断言失败，1.0.2 随后等待“无可用更新”提示超时。未将该结果记为通过，也未修改旧客户端或放宽断言。按用户明确不要求 Harmony 升级兼容的范围，撤回历史工作流的一行地址改动，最终 PR 保持该文件与 master 相同；历史测试仍保留，不改变五项必需 CI 或分支保护。

## 后续支持范围：macOS 仅 ARM64

用户在 PR 交付期间明确允许 Plus 不兼容 x86/x64 Mac，只需支持 arm64，并要求去除相应 CI。当前 CI 和手动 Build 均移除 `macos-15-intel`，保留 Windows x64 与 macOS arm64；README、构建说明及线上验证脚本同步为支持的平台。历史 Intel 安装包/证据和固定旧 Harmony 验收工作流保留原样，不宣称其为当前支持范围。

新的必需检查为 `test`、`lint`、`windows-package`、`macos-package-arm64`，只移除已授权取消的 `macos-package-x64` 要求，保持 strict、管理员保护和其余检查不变。本节取代前文五项检查及未来三平台发行的计划。最终两平台矩阵经 YAML 解析核对，更新/打包/脚本定向41项通过；最终 CI 与合入以 PR #93 为准。
