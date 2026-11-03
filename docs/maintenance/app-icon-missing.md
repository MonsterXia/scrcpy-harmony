# 应用图标缺失与本地读取边界（2026-11-03）

状态：**商店空响应引起的连带图标缺失已在源码修复；完整设备本地图标读取仍未实现。** 基线944f6fd，本机已安装/公开的1.0.5-dev.0尚未包含此修复，本轮未重新发布或替换安装包。

## 根因和修复

用户反馈应用网格中多个应用显示默认图标，并明确提出应优先使用设备本地图标。当前实现仅从商店补全部分非系统应用的图标；设备名称已经本地优先，图标尚未具备同等能力。

真实商店对`com.example.testhap`返回HTTP 200、`application/json`、零字节正文（Axios解析为`''`）。原处理器将它判为INVALID_RESPONSE并触发全局30秒冷却，导致后续正常商店应用也跳过请求。修复将**成功响应的空字符串**视为该包未收录，使用已有5分钟按包缓存；真实网络故障和非空畸形响应仍保留全局冷却与3秒取消。

## 验证

- 新增按包空响应/缓存过期测试和真实bundle处理器的侧载→正常应用回归，修复前分别失败；修复后49项bundle/商店专项全部通过。另验证非空HTML错误页仍触发冷却。
- 在相同网络顺序执行生产商店模块：WPS→Hello World→bilibili。基线WPS有图标、Hello World报INVALID_RESPONSE、bilibili图标为空；修复后WPS与bilibili都有图标，Hello World仍缺图标但不影响后续应用。
- 修复后的bilibili图片真实下载158938字节，系统图片解码工具识别为1024×1024 WebP。这是生产网络模块/图片验证，不冒充已安装Electron的UI验收。
- lint/i18n、主进程构建、diff检查通过；构建保留现有Vite CJS弃用提示。

## 本地图标优先的现场边界

对当前已授权设备只读核验Hello World及bilibili：`applicationInfo.iconPath`均为`$media:app_icon`，不是图片文件路径；`icon`为空。根据真实模块元数据尝试接收HAP和资源索引，四次均Permission denied、未取得文件。`bm dump -h`提供名称查询但无图标导出选项。未提权或修改设备应用/权限。

官方[BundleResourceManager文档](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-ability-kit/js-apis-bundleResourceManager-sys.md)将图标资源接口标为系统接口，要求`ohos.permission.GET_BUNDLE_RESOURCES`，并列出非系统调用及权限拒绝错误。不能因手机桌面离线能显示，就推断普通HDC会话可读取同一资源；也不能将资源ID直接当图片地址。

下一步仍按设备资源/合法可读HAP→本地缓存→商店补全→默认图标设计，但须先取得并验证授权的设备资源读取通道，或从用户主动交给应用安装的HAP中提取并缓存资源。缓存需绑定包、版本/更新及设备身份，避免重装后陈旧或跨设备串用；不能把历史商店缓存称为手机本地图标。M1-3保持进行中，侧载/系统/无网络图标、跨固件与跨平台均不得据本次空响应修复标为通过。
