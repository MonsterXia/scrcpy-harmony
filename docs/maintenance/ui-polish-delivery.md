# 截图切页与主窗口通知修复交付

2026-11-04 用户明确要求：提交 PR，独立审查、CI 和 PR 门禁通过后合入；**不做新版本发布**，完成后本地安装替换现有应用。

## 代码与独立审查

- [PR #86](https://github.com/MonsterXia/scrcpy-harmony/pull/86) 包含[截图切页修复](screenshot-navigation.md)与[通知样式修复](main-feedback.md)。版本保持 `1.0.5-dev.1`，不创建发行 tag 或 Release。
- 独立 reviewer 审查 `507a8be7899d285b388285f19ad9c3b0b057540f..4cd74d85f2ac6b1dd80f92fc07423cb2e55234a0`，结论可合入，无 P1/P2 问题。核对图片过渡属性、主窗口样式隔离、实际 Electron 验证脚本、归档哈希与截图。
- 审查未独立判定 CI、安装替换、真机和跨平台运行，也未冒充重跑全量测试。此前验证及计时用例首轮失败按专项记录保留。

## 交付约束与状态入口

仅在最终 PR head 的五项必需检查通过、审查讨论解决且满足正常保护规则后合入，不绕过门禁。安装使用 `npm run build` 与 `npm run pack -- --no-publish --adhoc-sign` 的本地 arm64 包；保留版本号并记录源码及包哈希，避免误认为它是新的公开发行包。

安装前退出应用，备份原应用与用户配置并核对文件哈希；新包验证版本、应用 ID、arm64 和 deep/strict 签名后替换，保留回滚副本。启动后核验配置、通知样式和截图切页。Mac 本地包使用 ad-hoc，不宣称 Developer ID 或公证。

CI、门禁、最终合入 SHA 与安装验证的实时交付结果记录在 [PR #86 的交付评论](https://github.com/MonsterXia/scrcpy-harmony/pull/86)。本地包、配置备份和安装审计位于忽略目录 `release/ui-polish-delivery/`；配置、设备标识和手机画面不提交仓库。
