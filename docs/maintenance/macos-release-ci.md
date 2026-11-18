# macOS CI 自动签名与公证

## 范围与状态

2026-11-18，按用户要求保留普通 PR 的快速打包检查，单独配置发行构建。实现经独立审查与四项必需 PR 门禁后由 [PR #100](https://github.com/MonsterXia/scrcpy-plus/pull/100) 合入。首次 [Release Build #31](https://github.com/MonsterXia/scrcpy-plus/actions/runs/44268063532) 在主干 `a9648e7` 上全部成功；下载产物的本机复验也通过，结构化结果见 [验证证据](evidence/macos-release-ci-20261118.json)。

- `.github/workflows/ci.yml` 不变：`test`、`lint`、`windows-package`、`macos-package-arm64` 四项必需检查；Mac 使用 ad-hoc，不接触签名凭据，不执行公证。
- `.github/workflows/build.yml` 改为手动 **Release Build**，只接受受保护的 `master`，分别生成 Windows x64 和 macOS arm64 产物。Mac job 时限 120 分钟，签名公证步骤时限 100 分钟；不创建或更新公开 GitHub Release。
- GitHub environment `macos-release` 仅允许 `master` 分支，5 项 Secret 已配置。PR 与 Windows job 不引用此 environment。

## 以后如何出包

1. 版本变更经普通 PR 检查合入 `master`。
2. GitHub → Actions → **Release Build** → Run workflow → 选择 `master`；或 `gh workflow run build.yml --ref master`。
3. 等待两个平台成功，下载 `macos-release-arm64` 和 `windows-release-x64` artifacts。Mac 附带 DMG、最终 `.blockmap`、更新 YAML、独立 CLI tgz、DMG 公证结果和安装验证 JSON。
4. 后续发布时使用同一次运行的附件。GitHub 更新 YAML 中安装包 URL 使用安全文件名（空格替换为 `-`），上传安装包和 blockmap 时按该 URL 命名，保持文件字节不变；不得混用旧构建的 YAML/blockmap。公开 Release 仍是单独操作。

缺少凭据、签名错误、公证拒绝/超时、票据缺失、Gatekeeper 拒绝、元数据不匹配或安装启动失败均阻止 Mac 产物上传。修复原因后重跑任务；不通过关闭公证或更改为 ad-hoc 绕过。

## 凭据维护

在仓库 Settings → Environments → `macos-release` 管理：

| Secret | 内容 |
| --- | --- |
| `CSC_LINK` | 含 Developer ID Application 证书与私钥的加密 p12，Base64 编码 |
| `CSC_KEY_PASSWORD` | 该 p12 的解密密码 |
| `APPLE_ID` | 付费开发者团队对应的 Apple 账户 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 该账户为 CI 生成的 App 专用密码 |
| `APPLE_TEAM_ID` | 10 位开发者团队 ID |

当前证书有效期截至 2027-12-17。更新证书时同时替换 p12 和密码，保留包含私钥的安全备份；App 专用密码撤销/账户密码变更后按 Apple 提示重新生成并更新 Secret。不把这些值、p12、私钥或 keychain 写入仓库、构建产物或日志。

运行时仅在需要的 step 注入凭据。公证密码由 `notarytool store-credentials` 验证后放入 runner 的临时钥匙串；打包通过 `APPLE_KEYCHAIN_PROFILE`/`APPLE_KEYCHAIN` 使用，最后 `always()` 删除。electron-builder 管理其临时签名钥匙串，runner 使用 GitHub 托管一次性机器。

## 实现与验证边界

`pack.mjs --release` 在读取 dist 前检查平台、profile、team 和证书配置，拒绝 `--adhoc-sign` 与 `--publish`。electron-builder 26 为 app 签名、公证、装订；`afterSign` 检查 Developer ID、团队、可信时间戳、Hardened Runtime、stapler 与 Gatekeeper。DMG 由 builder 签名，在 `artifactBuildCompleted` 中单独提交公证、装订并验证。

装订会改变 DMG 字节。finalizer 使用锁文件对应的 `app-builder-lib` 重新生成 blockmap 和 `event.updateInfo`，随后 builder 才生成更新 YAML。发布模式禁止打包时直接上传，避免 builder 提前发出的旧 blockmap 事件上传旧字节。

`check-macos-install.mjs --release` 在一次性 runner 中挂载 DMG、复制 app、卸载镜像，检查复制后的 app 与 DMG 信任状态、最终文件 hash/size/blockmap，并运行真实 Electron 隔离配置启动检查。报告 `verification-mac-arm64.json` 包含源 SHA、运行链接、版本、架构、团队、SHA-256、SHA-512、尺寸和各项结果。无设备测试与启动检查不替代其他 Mac 的下载体验或真机投屏。

本机复现已有钥匙串身份时，完整 build 后设置 `CSC_NAME`、`APPLE_TEAM_ID`、`APPLE_KEYCHAIN_PROFILE`（独立钥匙串时另设 `APPLE_KEYCHAIN`），运行 `npm run pack -- --no-publish --release`。本机不运行限定 GitHub 托管 runner 的安装脚本，以免清理日常 HDC 服务。

## 验证记录

- 定向配置、失败分支及真实临时文件/blockmap 测试：15/15 通过。
- 完整 `npm test`：同步最新主干后应用 1260 pass / 2 skip；Licia 生产与 fallback 各 606 passing / 4 pending。
- `npm run lint`（含 i18n）通过。
- actionlint 1.7.12 校验 release 与 PR workflow 通过；`git diff --check` 通过。
- GitHub 配置：5 项 Environment secrets 名称已确认，部署分支规则为 master；不读取/记录 secret 值。
- 独立审查：1 项 Windows 解包目录误上传问题已修复并复核；上传范围同时收窄为版本目录顶层文件，避免夹带 staging app 内部 YAML。
- [PR CI](https://github.com/MonsterXia/scrcpy-plus/actions/runs/44265444930)：test、lint、windows-package、macos-package-arm64 全部通过，unsigned WDA 依赖也通过；PR #100 正常合入，没有绕过分支保护。
- [首次 Release Build](https://github.com/MonsterXia/scrcpy-plus/actions/runs/44268063532)：源 `a9648e71cfc2443f65562fba58c28f718376ebd7`，Windows 和 Mac jobs 全部通过。Mac job 17 分 31 秒，其中 app/DMG 签名公证 9 分 7 秒；信任、元数据和安装启动检查 43 秒。临时公证钥匙串清理步骤通过。
- 下载复验：DMG 和复制后的 app 均通过 codesign、stapler、Gatekeeper；最终 YAML 的 size/SHA-512 与 blockmap 完整性通过，SHA-256 与 CI 报告一致。未替换本机安装版或触碰用户 HDC 服务。
- DMG：192999790 字节，SHA-256 `8db9d9162daf656167abfd3ea5e607f16b194f0a898204383185d76de087553d`。本机副本位于 `release/ci-macos-signing-20261118/1.0.5-dev.2/`。
- 首次 artifact 还包含不用于分发的 `builder-debug.yml`；后续已增加明确排除，actionlint 与使用实际下载文件名的 glob 校验通过。该调整不改变签名、公证或安装验证链路。
- 下一步：以后版本使用上述 Release Build 出包；公开 Release 和另一台 Mac 的实际下载体验按发行任务单独验收。当前记录不声称完成真机投屏或所有 macOS 版本兼容性验证。

## 参考

- [electron-builder 26 公证配置](https://www.electron.build/v26/docs/features/code-signing/notarization/)
- [electron-builder 26 macOS 配置](https://www.electron.build/v26/docs/mac/)
- [GitHub environment 部署限制](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [此前本机分发签名与证据](macos-distribution-signing.md)
