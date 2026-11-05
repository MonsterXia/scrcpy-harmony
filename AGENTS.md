# 项目上下文入口

本仓库为 **Scrcpy Plus**，基于 Scrcpy Harmony 改造的 Electron + React + TypeScript 多平台投屏工具。跨平台入口与当前限制见 [集成说明](docs/scrcpy-plus/integration.md)。下方项目 skill 仍描述继承的鸿蒙模块；新设备发现和会话入口以集成说明及当前源码为准。

处理本仓库的分析、开发、排错或构建任务时，先读项目 skill：

- [.agents/skills/scrcpy-harmony-project/SKILL.md](.agents/skills/scrcpy-harmony-project/SKILL.md)

skill 提供代码导航与按需参考资料。先定位相关模块，再核对当前源码；无需每次重新遍历全仓库。如果客户端未将仓库 skill 列入技能列表，直接读取上述文件即可。

分阶段维护任务以 [RUNBOOK.md](RUNBOOK.md) 为入口，来源与归档索引见 [docs/maintenance/SOURCES.md](docs/maintenance/SOURCES.md)。完成任务时同步更新状态、验证证据和下一步；未验证事项不得标为完成。

变更入口、IPC、构建流程或关键模块职责时，同步更新对应参考资料；依赖版本、设备连接状态等易变信息以现场检查为准。
