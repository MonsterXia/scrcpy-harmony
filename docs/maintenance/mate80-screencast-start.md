# Mate 80 投屏启动失败

2026-11-03，macOS arm64，HUAWEI Mate 80（VYG-AL30）。用户要求先本地提交已有修改，再定位修复当前设备无法启动投屏。图标修复与安装记录已提交为 `31bf35d` / `ba72765`；本轮修复为 `c1e94996ef2de2c776915ba8b3e40ff925c0d7e6`，分支 `codex/fix-mate80-screencast`。未推送、创建 PR 或发布。

## 现场与原因

安装版点击 Start mirroring 出现失败提示，应用日志为 `startCaptureScreen: UITest SDK version unconfirmed`，调用链位于 `UiDriver.shouldUpdateSdk` → 初始化控制服务。设备 UITest 版本为 `7.0.0.1`；现存 `/data/local/tmp/agent.so` 标记为 `UITEST_AGENT_LIBRARY@v0.0.0#1.2.5`，诊断时没有活动 UITest 进程。

旧实现直接截取 `@v` 后字符串，复合版本无法通过数字版本校验。仅取出 `1.2.5` 再按新旧比较仍不充分：客户端使用 1.1 系列 TCP 通信，不能复用 1.2 系列 Unix socket 代理。系统提供 UITest 能力，临时目录中的代理则由开发工具部署；本轮无法确定原代理由哪个工具放置，不能断言是系统升级自带或某个特定工具造成。

交叉核对 xdevice-ohos `6.1.0.210` 的 `ohos/proxy/proxy_base.py`：复合标记采用 `#` 后版本，按通信模式选择代理，并检查协议系列差异。参考包仅解压读取，未安装执行；[固定 wheel](https://files.pythonhosted.org/packages/78/a6/8ac621bb958813cde648d515069c30188939b492ffcdd29e8d1e234550cf/xdevice_ohos-6.1.0.210-py3-none-any.whl) SHA-256 为 `548a09bb6fc9fcfd92a7dbb5b69180de0159ce8959057e133dec34774054bb12`。

## 修改与回归

`vendor/packages/hdckit/src/hdc/UiDriver.ts` 严格解析旧标记和复合标记，后者使用 `#` 后版本；协议 major/minor 不同或同系列版本过旧时部署客户端配套代理。缺失、损坏或多个标记仍拒绝，不放宽为无条件覆盖。保留现有活动会话保护与受限恢复，没有新增广泛终止设备进程的逻辑。

新增 11 项回归：7 项版本/协议选择、4 项非法标记启动拒绝与无副作用断言。修复前 6 通过 / 5 失败；修复后连接、流、控制恢复和捕获驱动专项 43/43 通过。全量应用 900/900，Licia 两种模式各 606 passing / 4 pending，lint/i18n、完整构建及 arm64 DMG 打包通过。同步更新 vendor 与项目架构参考。

## 本机安装与真机验证

从固定修复提交构建本地 `1.0.5-dev.0` 修补包，备份原应用与用户配置，91 个常规文件逐一校验。替换 `/Applications/Scrcpy Harmony.app`，deep/strict ad-hoc 签名通过；安装包内 main/index.js 与本轮构建一致。重启后 5 个既有设置值均保持不变。

实际安装应用自动部署配套 `UITEST_AGENT_LIBRARY@v1.1.0`，设备文件 SHA-256 与仓库资源一致。通过正式 Start mirroring 入口观察到 Mate 80 锁屏实际画面；正常关闭投屏窗口并再次启动，显示手机桌面，未再出现初始化报错。初次安装后的首个截图结果被工具截断，未将其计为通过，后续两次明确观察才作为证据。验证期间一次 UI 操作因用户改变窗口状态被工具阻止，重新读取状态后正常完成关窗；没有据此修改产品代码。

脱敏构建、安装、代理前后哈希及验证统计见[机器可读记录](mate80-screencast-start.json)。本机忽略目录 `release/mate80-screencast/` 保留测试/构建日志、DMG、旧代理备份与 `backup-before-install/`，原始设备标识和手机画面不入库。

## 边界与下一步

本轮确认当前 Mac 与 Mate 80 的初始化及两次可见出图，不据此宣称触控、特定视频编码、长期运行、物理断连重连或并行外部调试工具全部通过。Windows、macOS x64 与其他固件真机矩阵仍待补测。公开 `1.0.5-dev.0` 附件保持不变，后续如交付远端需独立审查与 CI；本地优先图标仍为原有待办。
