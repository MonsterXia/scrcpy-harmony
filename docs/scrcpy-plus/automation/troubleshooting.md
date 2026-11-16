# 自动化问题定位

先保存 CLI 版本、协议版本、命令（脱敏）、退出码、error.code/outcome、主机系统和相关需求号。不要附 discovery.json、token、手机序列号、原始截图或输入文字。完整进度和 AUTO-BUG 编号见[维护记录](../../maintenance/agent-automation.md)。

| 症状 | 检查/恢复 | 代码/测试 |
| --- | --- | --- |
| UNAVAILABLE | 核对 --profile；应用必须包含新自动化服务；使用显式 service start | client.ts、discovery.ts；automation-cli |
| VERSION_MISMATCH | 对齐应用和 CLI 构建，schema 查看协议版本 | protocol.ts、client.ts |
| UNAUTHORIZED | 核对目录属主/权限，退出并重启对应 profile 的应用以刷新凭据；不要将 token 粘贴到命令行 | auth.ts、discovery.ts；automation-server |
| BUSY | 同 profile 已有实例或锁身份无法确认；先确认原实例状态，正常退出；不要批量杀设备工具 | discovery.ts、Electron 单实例启动 |
| 设备为空 | 查看 devices.list.errors；平台发现失败不等于没有设备；检查系统驱动/手机授权 | devices/index.ts、service.ts |
| not-implemented | 当前阶段未开放此能力；查看能力矩阵，不能靠换参数绕过 | capabilities.ts |
| TIMEOUT/OUTCOME_UNKNOWN | 先查询状态，不重发可能已执行的写操作；增加超时前确认设备授权与连接 | server.ts、client.ts |
| 启动超时 | --app 必须是可执行文件；开发 Electron 需 --app-arg 入口；核对资源构建 | cli/start.ts；automation-cli |
| Windows ACL 失败 | 服务不会降级为开放权限；保存错误码和系统版本，待 Windows 专项复核 | discovery.ts；Windows 验收 pending |

当前测试与构建命令：`node --test test/automation-*.test.cjs`、`npm run build:cli`、`npm run build:main`、`npm test`、`npm run lint`。全仓 TypeScript 目前存在继承诊断；不能将 Vite 成功当作严格类型检查全部通过。
