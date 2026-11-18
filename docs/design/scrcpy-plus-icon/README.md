# Scrcpy Plus 图标设计稿

日期：2026-11-18。状态：用户已确认方案并授权正式制作；正式资源已替换源码中的旧图标，macOS 原生资源已接入打包。当前验证与边界见[维护记录](../../maintenance/app-brand-icon.md)。

## 正式资源

- [正式三版与小尺寸对照](verification/formal-icons.png)，由真实矢量/PNG 资源渲染。
- 母版：`script/lib/app-icon-design.mjs`，统一双屏、加号与交叠留缝；`npm run gen:app-icons` 生成全套资源。
- `build/app-icons/{light,dark,mono}.{svg,png}`：三版矢量与 1024 像素 PNG；外轮廓和透明通道完全一致。
- `build/icon.png` / `build/icon.ico`：静态打包资源；`src/renderer/assets/icon*.png`：128 像素应用内资源。
- `build/ScrcpyPlus.icon`：macOS 原生背景、双屏、加号分层及默认/深色/着色配置。系统着色用高对比亮度蒙版，具体颜色由系统决定。
- 原型 PNG 不参与正式构建；正式资源由矢量生成，已消除原型透明区杂点。

## 三种外观预览（历史设计阶段）

以下是用户确认方向时的生成式预览，保留作为设计来源。

- [并排对照图](appearance-comparison.png)：左浅色，中深色，右单色；为生成式效果图，不是系统实际渲染截图。
- [浅色](light-preview.png)：瓷白底、蓝青双屏、深蓝加号。
- [深色](dark-preview.png)：午夜蓝底、亮蓝与青绿双屏、白色加号。
- [单色](mono-preview.png)：浅灰底、石墨色符号，交叠处增加负空间以区分双屏。

以上均使用内置 image_gen；完整提示词保存在 [appearance-prompts.json](appearance-prompts.json)。已目视检查三种配色与对照图。浅色和单色独立 PNG 的透明区仍有生成杂点，一轮清理尝试未解决，不能直接作为正式打包资源。正式制作需清理边缘、统一精确几何、分层并完成小尺寸及系统外观验收。本轮未实现自动主题切换。

## 最初设计方向

采用重叠屏幕和白色加号：屏幕表达投屏、镜像和跨设备连接，加号对应 Plus。深蓝圆角底承载蓝色与青绿屏幕，不采用任何操作系统标志，也不将设备数量固定为三个，便于后续扩展。

原图为 [concept.png](concept.png)，1254 × 1254，带透明通道。使用内置 image_gen 生成，未使用 API/CLI。已目视检查整体构图，并用 sips 核对尺寸和透明通道；尚未完成 16/32 像素辨识度、深浅色桌面和安装包显示验收。

## 系统外观适配要求

根据用户补充，最终交付包含系统图标外观适配。生成式概念 PNG 仅用于确定方向；实际切换依靠正式分层资源和应用内主题选择。

- 默认外观：评估浅底与蓝青屏幕组合，加号使用高对比颜色。
- 深色外观：保留深蓝底与蓝青屏幕，控制亮度和边缘对比。
- 单色基础：屏幕与加号在去除颜色后仍可辨识，支持系统着色及透明外观的验证。
- 所有外观保持同样的屏幕几何、加号位置与视觉尺寸；背景、屏幕和加号分层，避免把材质与阴影全部固化在 PNG 中。

macOS 原生适配以 [Icon Composer](https://developer.apple.com/icon-composer/) 的 Default、Dark、Mono 模式及系统呈现为依据；图标外观选择与应用窗口深浅主题并非同一设置。现已接入 Icon Composer 编译与打包，保留旧系统的静态 ICNS 回退。仅在运行时更换 Dock 图片不能作为 Finder 和未运行应用图标的完整适配。

验收目标覆盖默认、深色、系统着色/透明外观、自动跟随设置，以及应用运行前后的 Dock/Finder 显示；已完成与待验收范围以[验证汇总](verification/summary.json)为准。其他桌面平台保留统一品牌静态资源并检查深浅背景可读性，不预设其机制与 macOS 相同。

## 接入位置

- `build/icon.png`：1024 × 1024 打包图标，完整构建复制到 `dist/build`。
- `build/icon.ico`：Windows 打包资源。
- `src/renderer/assets/icon.png`：现有 128 × 128 应用内图标，由更新窗口使用。

正式资源已从统一矢量母版生成并替换以上文件。`src/renderer/assets/default-icon.png` 是设备应用缺失图标的回退，不属于本次品牌图标替换。

## 生成提示词

```text
Use case: logo-brand. Create one polished production application icon for Scrcpy Plus, a desktop tool that mirrors and controls Android, HarmonyOS and iOS devices. Output ONE isolated square app icon, front-facing orthographic, centered on genuinely transparent canvas, no contact sheet or text. Design: midnight navy rounded-square tile occupying about 84 percent of the square canvas, with generous smooth continuous corners. Inside, a bold elegant symbol of TWO overlapping rounded rectangular screen frames diagonally offset, rear frame upper left in saturated electric blue, front frame lower right in luminous turquoise. Frames are broad, simple, with clearly open dark interiors, each landscape or near-square proportions, not recognizable hardware. Integrate a large crisp white plus sign near the upper-right portion of the combined symbol, with dark clearance so it is clearly distinct, visually balanced and feels intrinsic to the mark rather than a notification badge. Simple memorable geometry, extremely legible at 32px, only 3 principal forms (two screen frames and plus). Sophisticated restrained soft color gradients and very subtle depth on frames, clean vector-like edges, predominantly flat icon design. Strong silhouette, balanced padding, modern professional desktop utility. No lettering, no wordmark, no operating-system logos, no triangle or gem, no wifi signal, no arrows, no cables, no phone buttons, no tiny detail, no elaborate glass effects, no floating 3D angle, no cast shadow outside tile, no background outside tile. Deliver a single icon ready to resize for app packaging.
```
