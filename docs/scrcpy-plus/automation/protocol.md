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

`outcome` 为 not-started/completed/unknown；无对应确认时不能把 timeout/cancelled 当作已回滚。意外后端异常转换为通用错误，不回传原始堆栈、设备日志或密钥。普通结果上限 1 MiB；截图成功响应使用下述二进制契约。

服务在收到完整请求后启动剩余期限；CLI 从命令开始计时并扣除准备耗时。连接断开、截止或退出会传播 AbortSignal。旧后端若不支持取消，不因此谎报设备操作已撤销。requestId 仅关联诊断，不提供持久去重。

## 代码定位

- 契约与退出码：`src/common/automation/protocol.ts`。
- 能力：`src/common/automation/capabilities.ts`。
- 传输/鉴权/发现：`src/main/automation/{server,auth,discovery}.ts`。
- 业务注册与设备适配：`src/main/automation/service.ts`。
- 生命周期/profile：`src/main/automation/{lifecycle,profile}.ts`、`src/main/index.ts`。
- 客户端/参数/输出：`src/cli/`。

协议不兼容的更改必须调整版本；兼容新增操作同步 schema、CLI 参考、能力矩阵和对应测试。

## 截图与会话契约

`screen.capture` 成功的 Content-Type 为 `application/vnd.scrcpy-plus.frame`。正文为 4 字节大端无符号 envelope 长度、UTF-8 JSON 成功 envelope（data.frame）和原始 PNG；JSON ≤1MiB，PNG ≤32MiB。失败仍为 JSON。主机输出路径只由 CLI 处理，服务不接收 output 参数。

`data.frame` 包含 sessionId、frameId、sequence、generation、capturedAt、clock=host、width、height、displayRevision、rotation、mimeType=image/png 和 stale。capturedAt 为画布呈现时间；rotation 是导出位图的额外变换，当前正向解码画布为 0，不能据此推断手机物理方向。最后 16 份已导出引用最多保留 60 秒。

会话入口：`runtime.ts` / `sessionOperations.ts` / `controller.ts`；租约：`sessions.ts`；帧验证和引用：`frameBridge.ts` / `frames.ts`；平台输入：`adapters/{android,harmony}.ts`。专用 preload 的 automationFrameRequest/Result/State 只接受已注册窗口、当前 mainFrame 和匹配请求 ID，不开放任意 renderer 执行。

停止最多等待 5 秒确认；超时返回 OUTCOME_UNKNOWN，保留清理义务及 lease，后续 release 加入同一关闭过程。输入队列按设备串行，取消时仍独立尝试最多 5 秒的触点释放；无法确认则隔离该代际。输入成功只签发新观察屏障，不证明设备业务动作成功。

## 有限文件结果

logs.capture/layout.dump 使用 `application/vnd.scrcpy-plus.blob`，同样为 4 字节 envelope 长度 + JSON + 原始字节；data.artifact 包含 artifactId、mimeType、byteLength，日志另含 durationMs/truncated。字节数最多 1MiB，允许空日志；截图仍要求非空。CLI output 不进入服务参数。
