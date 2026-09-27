# SkillSage · 技匠文档

<p align="center">
  <img src="../skillsage-logo.png" alt="SkillSage Logo" width="96" height="96" />
</p>

产品 Logo 的唯一源文件是仓库根目录的 [`skillsage-logo.png`](../skillsage-logo.png)。替换后运行 `pnpm sync:branding`，即可重新生成产品内 Logo、favicon 和桌面端图标。

## 指南

- [`guides/cross-platform-qa.md`](guides/cross-platform-qa.md)：Windows/macOS 验证矩阵、日志位置和发布前检查

## 设计

- [`DESIGN.md`](DESIGN.md)：视觉设计系统（配色、字体、布局、层次、形状、组件、Do/Don't）。机器可读的 token 在前置 YAML 中，是唯一权威来源；正文解释每个 token 的用途和约束。
- 配套的 `.impeccable/design.json` 承载前置 YAML 放不下的内容（色阶、阴影、动效、断点、组件 HTML/CSS 片段），供 Impeccable 实时面板渲染本项目真实组件。

改动界面时以 `DESIGN.md` 的 Named Rules 为准；新增颜色或间距前先确认它是否属于既有体系。

历史规格和设计系统草稿已移除；当前实现以源代码、测试、根目录 README、QA 指南、`DESIGN.md` 和项目记忆为准，避免维护重复且过时的规范。
