# 通用 UI 样式

## 弹窗与底部操作

新增弹窗或改造已有弹窗时，先选已有组件。主窗口、投屏窗口和辅助工具窗口共用这套样式。

| 场景 | 组件与用法 |
| --- | --- |
| 设置、表单、工作区工具 | 使用 [Dialog](../../../../src/share/renderer/dialog/Dialog.tsx)。通过 `title`、正文和 `footer` 组织内容，按内容宽度选 `compact`、`normal` 或 `wide`。 |
| 应用详情、布局属性侧栏 | 使用 `Dialog size="drawer"`。 |
| 删除、卸载、停止等危险操作 | 使用 [ConfirmDialog](../../../../src/share/renderer/dialog/ConfirmDialog.tsx)，传入具体的确认文案，保留「取消」的默认焦点。 |
| 已有独立窗口，只需要底部操作 | 直接复用 `DialogFooter`，如[软件更新窗口](../../../../src/renderer/update/App.tsx)。系统文件选择和保存沿用原生对话框。 |

**底部按钮采用升级窗口的长圆角样式。** 把每个操作的 `<button type="button">` 作为 `DialogFooter` 的直接子元素，组件会让按钮占满内容区宽度，文字居中，两侧留白相等。多个操作纵向排列，每个按钮独占一行。关闭或取消使用默认色，主操作用 `data-tone="primary"`，危险操作用 `data-tone="danger"`。

低频管理操作放入 `secondary` 插槽，通过折叠项在按钮上方单独展示。同一说明适用于多个操作时，在展开区域写一次即可。[iPhone 设置](../../../../src/renderer/native-mirror/IosSetup.tsx) 展示了账号管理与「关闭」的组合。

圆角、间距、颜色与键盘焦点样式由[公共样式表](../../../../src/share/renderer/dialog/Dialog.module.scss)维护。调整整套视觉时修改公共样式；业务组件负责文案、操作顺序和回调。表单内的提交按钮和工具栏图标按各自场景布局。

审查布局时，在中英文、深浅主题和窄窗口下检查长文案是否换行、底部按钮是否完整可见。涉及弹窗交互时，检查 Tab 焦点范围、Esc 对最上层弹窗的作用及关闭后的焦点恢复；进行中的任务沿用其取消语义。
