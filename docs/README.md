# SkillSage 文档

<p align="center">
  <img src="../skillsage-logo.png" alt="SkillSage Logo" width="96" height="96" />
</p>

本目录是除根目录 README（[英文](../README.md) / [中文](../README.zh-CN.md)）之外的长期文档。

## 指南

- [`guides/cross-platform-qa.md`](guides/cross-platform-qa.md)：Windows/macOS 验证矩阵、日志位置和发布前检查

## 设计

- [`DESIGN.md`](DESIGN.md)：视觉设计系统（配色、字体、布局、层次、形状、组件、Do/Don't）。机器可读的 token 在前置 YAML 中，是唯一权威来源；正文解释每个 token 的用途和约束。
- 配套的 [`.impeccable/design.json`](../.impeccable/design.json) 承载前置 YAML 放不下的内容（色阶、阴影、动效、断点、组件 HTML/CSS 片段），供 Impeccable 实时面板渲染本项目真实组件。

改动界面时以 `DESIGN.md` 的 Named Rules 为准；新增颜色或间距前先确认它是否属于既有体系。

## 发布说明

- [`releases/`](releases)：每个发布标签一个文件，由发布 workflow 读取为 GitHub Release 正文。
  不要内联到 `release.yml`，否则会重蹈"忘记修改、沿用上一版说明"的问题。

## 调研记录

以下文件记录了一次性的调查结论，是相关决策的依据。**它们是历史记录，不是当前规范**——
规范以源代码、测试、README 和 `memory/` 为准。

- [`research/workbuddy-skill-path.md`](research/workbuddy-skill-path.md)：确认 CodeBuddy/WorkBuddy 的真实技能目录是
  `~/.codebuddy/skills`，`~/.workbuddy-ai/skills` 并不存在。该结论仍是当前约束，见
  `memory/areas/legacy-paths.md`。
- [`research/github-mirror-nodes.md`](research/github-mirror-nodes.md)：对 80 个 GitHub 代理节点的可用性与延迟实测，
  是 `core/mirrors.rs` 中 `MIRRORS` 五个节点的选取依据。延迟数据会过时，节点清单以代码为准。

## 项目记忆

- [`memory/`](memory)：MemoryCustodian 管理的长期约束与已确认决策。入口是
  [`memory/manifest.md`](memory/manifest.md)，它决定哪些文件按任务加载。这部分由
  `memory-custodian` CLI 维护，不要手工改路由。

## 已移除的内容

历史规格（`docs/specs/`）和设计系统草稿（`design-system/skillsage/MASTER.md`）已删除。它们与实现形成
两套标准，维护成本高于价值。不要重建它们，也不要把它们当作当前依据。
