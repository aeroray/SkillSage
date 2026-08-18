# SkillSage 文档

<p align="center">
  <img src="../skillsage-logo.png" alt="SkillSage Logo" width="96" height="96" />
</p>

产品 Logo 的唯一源文件是仓库根目录的 [`skillsage-logo.png`](../skillsage-logo.png)。替换后运行 `pnpm sync:branding`，即可重新生成产品内 Logo、favicon 和桌面端图标。

## 规范

- [`specs/01-需求文档.md`](specs/01-需求文档.md)：产品范围、安装来源和卸载策略
- [`specs/02-设计规范.md`](specs/02-设计规范.md)：桌面端视觉与交互规范
- [`specs/03-后端架构.md`](specs/03-后端架构.md)：Rust 核心模块与 Tauri commands
- [`specs/04-前端结构.md`](specs/04-前端结构.md)：页面、feature hooks 和共享组件
- [`specs/05-生命周期状态机.md`](specs/05-生命周期状态机.md)：安装、更新、回退、卸载时序
- [`specs/06-开发阶段规划.md`](specs/06-开发阶段规划.md)：Phase 1–7 交付物与验证标准

## 指南

- [`guides/cross-platform-qa.md`](guides/cross-platform-qa.md)：Windows/macOS 验证矩阵、日志位置和发布前检查
