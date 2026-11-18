# Scrcpy Plus 自动化接口

当前为开发分支能力，协议 v1。已实现应用内本地服务、CLI 服务启动/状态/诊断、设备发现、会话 lease、画布截图和 Android/Harmony 输入。M3 已通过真实 Electron 模拟闭环，真机/Windows 验收仍 pending；现有鸿蒙设备工具及 [MCP](mcp.md) 已完成本机候选实现，最终回归和真机/平台验收状态见[实施计划](../../superpowers/plans/2026-11-16-agent-automation.md)。

## 开发运行

需要 Node >=22.12.0 和本项目可运行的 Electron 构建。安装版不自动获得开发分支的新接口；需要对应的新构建。

```sh
npm run build:cli
node dist/cli/index.cjs --help
node dist/cli/index.cjs schema --json
```

打开当前开发构建后，可使用默认用户配置目录查询：

```sh
node dist/cli/index.cjs service status --json
node dist/cli/index.cjs devices list --json
node dist/cli/index.cjs devices capabilities --device '<devices list 返回的 key>' --json
```

`npm run --silent cli -- devices list --json` 会先构建 CLI 再运行；自动化脚本推荐直接调用已构建 bin，避免 npm 输出混入结果。

## 独立客户端包

`npm run build:cli` 在 `dist/cli` 生成独立包，包含可执行脚本、package.json 和许可证；运行不加载 Electron、USB 或项目 node_modules。它仍需要同机运行对应的 Scrcpy Plus 应用。

```sh
npm pack ./dist/cli
# 在你自己的目标目录安装上一步生成的 tgz：
npm install --prefix /absolute/path/to/client ./scrcpy-plus-cli-1.0.5-dev.3.tgz
/absolute/path/to/client/node_modules/.bin/scrcpy-plus --help
```

Windows 使用 `node_modules\.bin\scrcpy-plus.cmd`；也可在两平台直接用 Node 运行安装包的 `index.cjs`。版本随仓库 package.json，不代表已经公开发布。

## Profile 与启动

默认 profile 为 macOS 的 `~/Library/Application Support/Scrcpy Plus`、Windows 的 `%APPDATA%\Scrcpy Plus`。`--profile` 或 `SCRCPY_PLUS_PROFILE` 可选择绝对路径；命令行选项优先。隔离测试建议新建 profile，不修改日常设置。

显式启动时传可执行文件绝对路径；macOS `.app` 目录本身不是可执行文件，需要传其 `Contents/MacOS/...` 文件。开发时将仓库根目录作为应用入口，让 Electron 读取项目的包名与版本：

```sh
node dist/cli/index.cjs service start \
  --app /absolute/path/to/Electron.app/Contents/MacOS/Electron \
  --app-arg /absolute/path/to/scrcpy-plus \
  --profile /absolute/path/to/test-profile --json
```

每个应用参数单独一个 `--app-arg`，空格和非 ASCII 路径保留参数边界。同 profile 已有可用服务时直接复用。其他命令不隐式启动应用。

`--client agent-a` 创建持久命名客户端身份，供后续 lease 归属使用；不同 Agent 使用不同名称。客户端身份不是认证凭据；本机用户是信任边界。正常应用退出关闭本地服务；没有开放远程控制或通用 IPC 执行入口。

继续阅读：[命令参考](cli.md)、[协议](protocol.md)、[能力矩阵](capabilities.md)、[问题定位](troubleshooting.md)、[实际验证进度](../../maintenance/agent-automation.md)。

Agent 使用入口：[独立 skill](../../../.agents/skills/scrcpy-plus-automation/SKILL.md)、[MCP 安装与配置](mcp.md)。`npm run build:cli` 构建两个独立 bin；`npm run check:automation-package` 在临时目录安装 tarball 并验证 CLI/MCP。

当前[本地候选验收与交接](acceptance.md)汇总需求映射、构建产物、审查修复、执行取舍、遗留问题与继续验收条件。
