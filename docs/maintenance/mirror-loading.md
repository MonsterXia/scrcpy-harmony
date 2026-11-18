# 投屏加载态统一（2026-11-18）

用户要求各平台投屏加载态沿用 iOS 现有的居中圆角卡片。将卡片、旋转图标、深浅主题变量、窄窗口适配及减少动态效果样式提取至 `src/renderer/components/MirrorStatus.tsx` / `MirrorStatus.module.scss`，Android、iOS USB、鸿蒙及 AirPlay 连接等待共用。

鸿蒙将原 LoadingBar 替换为卡片，沿用 CaptureState：首次启动与重连显示，ready 后隐藏；加载时采用与 iOS 相近的暗化底色。Android/iOS 原有状态文案与重试行为保留，AirPlay 等待仍显示其连接指导。iPhone 设置弹窗与输入异常提示引用提取后的共享样式，避免出现第二套视觉参数。

验证：相关 Node 回归 50/50（含投屏生命周期、native renderer、iOS 设置登录），lint/i18n 和 renderer 构建通过。提取 CSS 后旧登录测试的 mock 仅识别原样式路径导致一项失败，已将样式边界 mock 改为识别 SCSS，重新执行全部 50 项通过。没有增加仅复述布局实现的测试。

限制：本地浏览器预览被工具的 file URL 安全策略拒绝；未绕过。双语、深浅主题及窄窗口的实际视觉验收仍待补齐，静态检查不能替代。当前变更已进入本地 renderer 构建，既有已签名 app/ZIP/DMG 未重打，不声称运行中的旧包已更新。WDA 重启后的 start-timeout 是此前独立问题，本轮未改设备启动逻辑。

下一步：在更新后的桌面包补双语视觉与真实连接/重连显示验收，再按交付范围重新签名、公证。
