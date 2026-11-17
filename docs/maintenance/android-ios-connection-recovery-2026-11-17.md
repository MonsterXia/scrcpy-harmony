# Android 接口占用与 iOS WDA 重连（2026-11-17）

## 已完成

Android 概览失败为 LIBUSB_ERROR_ACCESS，现场 Android Studio 的多个客户端连接着已有 ADB 服务，目标手机在该服务中唯一在线。认证前 USB claim ACCESS/BUSY 时释放自己的 USB 句柄，通过固定回环 127.0.0.1:5037 共享现有服务；精确匹配 USB 序列号并固定 transport ID，认证失败/其他 USB 错误不换传输，不启动或终止全局 ADB，不 detach 设备。连接建立有界，读取背压有界，清理仅销毁本客户端 socket。无序列号、重复/离线/未授权目标均不回退到其他设备。

用户确认 iOS 没有拔插 USB。现场旧 WDA 进程存在，但独立 GET /status 报 EPIPE，未发现运行中的 Xcode 测试宿主；重启本项目已签名的专用 Runner 后 HTTP 恢复。客户端此前只在 USB 缺席时设置 reconnectPending，导致 USB 一直在线时不会自动恢复。现曾连接成功的 iOS 会话在 disconnected/error 时也设置恢复标记，由设备轮询串行清理、重建并恢复模式；首次 WDA 准备失败不重复分配会话。

## 验证

两个回归修改前分别失败，修改后通过。全量 1189 pass / 2 skip / 0 fail；最终连接取消/背压调整后 56 项相关测试通过，lint/i18n、main 构建通过。回环 ADB 协议测试覆盖精确 transport、拒绝其他/未授权/重复设备、拒绝 serial 命令注入和仅关闭自有连接。

真机 Android 概览读到 Android 13 (API 33)、M2007J1SC，投屏已实际呈现；Android Studio 与其原 ADB 服务保持运行。静态画面的一次 CLI 新鲜帧截图超时，不据此声称连续帧/新鲜度矩阵已通过。

真机 iOS 已恢复视频。额外终止本项目专用 Runner 模拟服务故障，USB 始终连接；再次启动签名 Runner 后，同一 GUI/会话无需重试即自动恢复 running/video，截图实测 780×1688、sequence 3501、非过期。测试租约清理，GUI 归属保留；安装版未替换。详见 [证据](../scrcpy-plus/evidence/connection-recovery-2026-11-17/verification.json)。

## 尚未验证与下一步

旧 Runner HTTP 服务自行失效的根因尚未确定。桌面端负责响应 WDA 恢复，不自动启动/签名 Runner；继续保留专用 Xcode 测试宿主并观察长时间稳定性。其他平台上的本机 ADB 共享、复杂多设备/多客户端并发与快速拔插矩阵仍待验证。
