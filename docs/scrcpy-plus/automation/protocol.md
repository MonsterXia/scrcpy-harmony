# 自动化协议 v1

来源：`src/common/automation/protocol.ts` 与 `descriptions.json`。后者为机器接口的稳定英文描述，不随桌面界面语言变化；中文操作说明见本目录。

## 本地传输

Electron 服务仅在 `127.0.0.1` 随机端口监听。`<profile>/automation/discovery.json` 保存 apiVersion、endpoint、instanceId、pid 和私有 token；不可复制到问题报告。请求使用 `Authorization: Bearer <token>` 和 `X-Scrcpy-Instance`；Host 必须匹配实例 endpoint，Origin 请求被拒绝，无 CORS。客户端检查服务进程存在，握手校验实例，避免只按端口连接。

服务依赖 Electron 的同 profile 单实例锁；另有 `server.lock` 防止服务重复启动。仅已取得 Electron 单实例锁的启动路径可回收确认进程已死亡的锁。身份无法确认时失败，不按进程名称批量清理。

POSIX 目录 0700、凭据文件 0600，拒绝符号链接目录和非当前用户文件。Windows 使用当前 SID 的独立目录 ACL；实现已落地，Windows 真实验收仍 pending。ACL 实现参考 [Microsoft Set-Acl](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/set-acl?view=powershell-5.1)。

## 请求与结果

`POST /v1/call`，Content-Type 为 application/json，请求体最多 1 MiB：

```json
{"apiVersion":1,"requestId":"example-1","clientId":"cli:example","operation":"devices.list","params":{},"timeoutMs":30000}
```

`requestId` 和 `clientId` 仅允许 1—128 个字母、数字、下划线、点、冒号和连字符。操作、参数及类型严格按 schema 校验，不支持通用 IPC 调用。

成功：`{apiVersion:1,requestId,ok:true,data:...}`。
失败：`{apiVersion:1,requestId,ok:false,error:{code,message,retryable,outcome}}`。

`outcome` 为 not-started/completed/unknown；无对应确认时不能把 timeout/cancelled 当作已回滚。意外后端异常转换为通用错误，不回传原始堆栈、设备日志或密钥。普通结果上限 1 MiB；后续截图使用单独二进制契约。

服务在收到完整请求后启动剩余期限；CLI 从命令开始计时并扣除准备耗时。连接断开、截止或退出会传播 AbortSignal。旧后端若不支持取消，不因此谎报设备操作已撤销。requestId 仅关联诊断，不提供持久去重。

## 代码定位

- 契约与退出码：`src/common/automation/protocol.ts`。
- 能力：`src/common/automation/capabilities.ts`。
- 传输/鉴权/发现：`src/main/automation/{server,auth,discovery}.ts`。
- 业务注册与设备适配：`src/main/automation/service.ts`。
- 生命周期/profile：`src/main/automation/{lifecycle,profile}.ts`、`src/main/index.ts`。
- 客户端/参数/输出：`src/cli/`。

协议不兼容的更改必须调整版本；兼容新增操作同步 schema、CLI 参考、能力矩阵和对应测试。
