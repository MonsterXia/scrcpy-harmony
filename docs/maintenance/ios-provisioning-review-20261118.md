# iPhone 桌面准备独立审查（2026-11-18）

用户授权独立审查本地更改，无阻断问题后按项目规范创建 PR；再对最终 PR 独立审查，必需 CI 通过后正常合入。基线为 `1007885`，分支 `codex/ios-provisioning-and-mirror-status`。保留此前 macOS 分发和真机验收历史，未把历史包当作本次最终提交。

## 已确认与修复

- P1：退出登录未持有账号互斥，会与登录、续签或另一次退出并发。现在覆盖 helper 和持久化整个阶段，取消/销毁后拒绝迟到启动。
- P2：窗口在 backend close 或 manager restore 等待时关闭，准备可在销毁后继续。现在 IPC 和自动准备绑定调用者生命周期；加入既有后台任务只取消当前等待，不取消后台所有者。
- P2：旧预约 journal 清理完成不能证明 WDA 空闲。现在再次精确 inspect，保留其他 session 的 busy 状态。
- P2：退出清理全部钥匙串记录会删除仍占用开发证书名额的唯一私钥。现在只清认证 session，保留 identity 与 Anisette 客户端状态；按钮双语说明保留签名凭据。没有新增证书撤销功能。
- P1：已有 unsigned Runner 与同 commit 的旧补丁缓存会被复用。现在默认增量重建 WDA，源码按 commit+manifest 指纹隔离，资源 stamp 纳入构建输入；未知编辑拒绝覆盖。
- P1：较新 Xcode/DDI 下普通前台启动不符合 XCTest Runner 后台启动要求。设备 helper 改用 DVT ProcessControl 后台启动，保留精确 bundle/unknown/busy 检查和不终止已有进程的规则。依据为 [Appium 上游修复](https://github.com/appium/appium-ios-remotexpc/commit/9785fa9)；尚不能由此断言此前真机失败根因已证实。
- 临时 loading-preview/ios-wda-input 目录加入忽略与 dist/build 排除；新增 Actions 引用固定官方 SHA，Windows helper 编译局部隔离 AirPlay 的 MinGW CC/CXX。

## 验证状态

- 审查前应用 1235 pass / 2 skip，Licia 两模式各 606 pass / 4 pending，lint/i18n 通过。
- 新增竞态/恢复回归先失败后通过，相关核心测试 59/59；构建缓存回归 13/13；退出登录 Rust 4/4；设备 Python 9/9（含后台启动参数、不替换 unknown/busy、bundle 身份）。
- 修复整合后应用 1248 pass / 2 skip，Licia 两模式各 606 pass / 4 pending。完整本地构建（含新 WDA 源码缓存的 Xcode 编译、Rust/Python helpers、三部分 Electron 与 CLI）及 lint/i18n 均通过。新上下文整批复审未发现剩余 P0–P2，独立执行 Node 99/99、Python 9/9；允许创建 PR，合入等待最终 CI。
- 用户已被邀请重启解锁手机补新后台启动真机验收；不以单元测试替代。当前桌面包仍为较早候选。

## 门禁与未验收范围

master 使用严格最新基线要求；必需检查为 test、lint、windows-package、macos-package-arm64，管理员同样受保护。不得绕过门禁。准备提交并创建 PR；未合入或发布。远端结果以 PR 最终提交为准。

Windows 的实际 native 编译/安装由 PR CI 验证；干净 Mac/DDI、真实经过七天的续签与长期连接仍待验收。Python lock 的 Windows 专用传递依赖尚未全部固定，不能标记为完全可复现环境。加载卡片静态/状态回归通过，新的双语深浅窄窗口视觉验收仍待补；此前本地 file URL 浏览器预览被策略拒绝，未绕过。
