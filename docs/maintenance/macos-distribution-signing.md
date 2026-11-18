# macOS 分发签名与公证（2026-11-17）

2026-11-18：包含 Apple ID/WDA 自动准备与续签的新 arm64 候选也已正式签名、公证并通过 Gatekeeper。文件、校验值与验证边界见 [新候选证据](evidence/macos-ios-provisioning-signing-20261118.json) 和 [集成记录](ios-desktop-provisioning.md)。下文保留 11 月 17 日原候选结果。

## 状态与范围

**2026-11-17 19:18（UTC+8），本机 arm64 候选的完整构建、应用和 DMG 的正式签名、公证、票据装订、Gatekeeper 与从 DMG 复制的应用启动验收全部通过。** 结构化证据见 [验证报告](evidence/macos-distribution-signing-20261117.json)。

本次候选源码为 `a5175fe`，版本 `1.0.5-dev.2`，仅 macOS arm64。它包含已公开 dev.2 后的主干更新，不是原公开附件的逐字节重签。未修改公开 Release、自动更新元数据或 `/Applications` 安装版。GitHub Actions secrets 尚未在本任务中配置。

## 本机复现

准备好 Developer ID Application 身份和公证 profile 后，在仓库根目录执行以下命令。同一工作区的构建共用 `dist/`，请等本次打包结束后再启动下一次构建。

```sh
npm run build && \
APPLE_KEYCHAIN_PROFILE='<钥匙串中的公证配置名>' \
  CSC_NAME='<签名身份的名称（团队 ID）>' \
  npm run pack -- --no-publish
```

不要同时使用 `--adhoc-sign`：它会选择临时签名并关闭公证。`CSC_NAME` 指定证书名称中的团队部分；electron-builder 自动限定 Developer ID Application 类型。签名材料放在仓库外，不将私钥、App 专用密码、导出的 p12 或钥匙串内容提交到版本库。

当前 electron-builder 26.15.3 使用 `APPLE_KEYCHAIN_PROFILE` 调用公证服务并为 app 装订票据；未提供凭据时可能跳过公证，因此打包退出成功不是分发信任验收。必须检查实际产物：

```sh
codesign --verify --deep --strict --verbose=2 '/path/to/Scrcpy Plus.app'
codesign -dvvv '/path/to/Scrcpy Plus.app'
xcrun stapler validate '/path/to/Scrcpy Plus.app'
spctl --assess --type execute --verbose=4 '/path/to/Scrcpy Plus.app'
```

验收应包含从最终 DMG 复制的 app，以及隔离用户配置的启动检查；不能只检查 staging app。DMG 自身的签名/公证/装订与 app 分开记录。保留 DMG SHA-256，避免把旧未公证包误作新包。

如需复现本次独立 DMG 验收，将 electron-builder DMG 复制为 `*-signed.dmg`，执行 `codesign --sign <证书指纹> --timestamp <DMG>`、`xcrun notarytool submit <DMG> --wait --keychain-profile '<钥匙串中的公证配置名>'`，确认 `Accepted` 后运行 `xcrun stapler staple <DMG>`。随后验证 DMG 的签名和票据，并运行 `spctl --assess --type open --context context:primary-signature --verbose=4 <DMG>`。对独立副本的签名和装订会改变文件字节，**不得配用原构建目录的更新 YAML/hash/blockmap**；本次仅交付独立手动安装包，后续自动更新发行须重新生成并验证相应元数据。

## 证据与下一步

- 初始本机安装版：ad-hoc，deep/strict 签名完整，Gatekeeper 拒绝，无 stapled ticket。
- 构建日志：本地 `release/macos-signing-20261117/build.log`；完整构建通过。
- 签名：staging app `codesign --verify --deep --strict` 通过；包含 Developer ID 证书链、可信时间戳、团队 ID 和 Hardened Runtime。证据为本地 `app-codesign-{verify,details}.log`。
- 启动：`script/smoke-app.mjs` 对 staging app 的隔离配置检查通过，包含窗口、IPC、设置页面、原生 AirPlay 模块载入及正常退出；不等同于真机投屏验收。证据为本地 `staging-smoke.log`。
- 应用公证：2026-11-17 19:11:12（UTC+8）提交 `Scrcpy Plus.zip`，结果 `Accepted`。证据为本地 `app-notary-info.json` 和 `app-notary-log.json`。
- DMG 公证：2026-11-17 19:15:27（UTC+8）提交，结果 `Accepted`。证据为本地 `dmg-notary-info.json`。
- 最终 DMG 的签名、stapler 及 Gatekeeper 通过；复制后的 app 同样通过 deep/strict、stapler、Gatekeeper 及生产 smoke 脚本。app 和 DMG 均返回 `accepted / source=Notarized Developer ID`。证据为本地 `installed-checks.json`、`dmg-checks.json` 与对应命令日志。
- 最终文件：`release/macos-signing-20261117/Scrcpy Plus-1.0.5-dev.2-mac-arm64-signed.dmg`，130998150 字节；SHA-256 `d83dd7e281ab27c1ec98667b779719984ec8a69778a5638e3635d9d78f086e64`。
- 打包日志及上述证据均位于本地 `release/macos-signing-20261117/`；仓库归档了不含凭据的结构化验证报告。
- 后续：在另一台 Mac 实际下载验收；独立发布和 CI 签名凭据配置仍待后续安排。本次未执行真机投屏矩阵，不将本机 Gatekeeper 评估称为其他电脑的下载实测。

## 官方参考

- [Developer ID 证书与角色要求](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
- [App 专用密码](https://support.apple.com/zh-cn/102654)
- [macOS Gatekeeper 与公证](https://support.apple.com/en-us/102445)
