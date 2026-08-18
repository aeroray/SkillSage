<div align="center">
  <img src="./skillsage-logo.png" alt="SkillSage Logo" width="120" />
  <h1>SkillSage</h1>
  <p>面向 Windows 和 macOS 的桌面端 AI Agent 技能管理器</p>

  <p>
    <a href="#功能概览">功能概览</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="#开发者指南">开发者指南</a> ·
    <a href="#项目文档">项目文档</a>
  </p>
</div>

SkillSage 用一个私有中央仓库管理 AI Agent 技能，再通过 Windows junction 或 macOS symlink 将技能分发到用户选择的工具目录。它适合需要统一安装、更新、迁移和维护多套 AI 工具技能的个人开发者与团队。

> [!NOTE]
> SkillSage 是桌面端软件，主窗口默认及最小尺寸为 `1200×800`，支持最大化，不面向移动端布局。

## 功能概览

- **我的技能**：查看已安装技能，执行更新、回退、卸载、分发调整和批量分发。
- **技能商店**：搜索 skills.sh，查看技能详情，并从商店或 GitHub 安装技能。
- **本地导入**：导入 `SKILL.md` 文件、技能目录，或包含单个技能目录的父目录。
- **多工具分发**：支持 Claude Code、Cursor、GitHub Copilot、OpenAI Codex CLI 和 OpenCode。
- **存量迁移**：扫描已注册工具目录和 `~/.agents/skills/`，识别可接管、冲突或失效的旧技能链接。
- **跨设备同步**：导出远程技能记录、分发目标和非敏感应用设置，在另一台设备上重新获取指定提交并恢复。
- **设置与清理**：配置代理、保存 GitHub Token 到系统密钥环，并在卸载前选择清理范围。
- **可诊断性**：统一的加载/错误状态，以及写入平台应用日志目录的普通日志和 tracing 日志。

## 快速开始

### 从源码运行

开发环境需要 Node.js、pnpm、Rust stable，以及 Tauri 2 的桌面构建依赖。

```bash
pnpm install
pnpm sync:branding
pnpm exec tauri dev
```

`pnpm dev` 只启动 Vite 浏览器预览；完整桌面能力请使用 `pnpm exec tauri dev`。

### 构建桌面应用

```bash
pnpm exec tauri build
```

如需只验证构建而不生成安装包，可以运行：

```bash
pnpm exec tauri build --debug --no-bundle
```

### Logo 维护

仓库根目录的 [`skillsage-logo.png`](./skillsage-logo.png) 是唯一 Logo 源文件。替换它后重新运行：

```bash
pnpm sync:branding
```

该命令会同步前端资源、favicon 和 Tauri 的 Windows/macOS 图标，并清理桌面版本不使用的移动端派生图标。

## 用户数据与安全边界

SkillSage 默认使用用户目录下的中央仓库：

| 数据 | 位置 |
| --- | --- |
| 远程技能 | `~/.skillsage/remote/` |
| 本地技能 | `~/.skillsage/local/` |
| 技能锁定记录 | `~/.skillsage/lock/skill-lock.json` |
| 同步数据文件 | 用户在导出时选择的位置 |
| 代理配置 | `~/.skillsage/settings.json` |

- Windows 使用 junction，macOS 使用 symlink；分发不会复制技能内容。
- 同步数据包含远程技能记录、分发目标和非敏感应用设置；GitHub Token 使用 Windows 凭据管理器或 macOS Keychain 保存，不写入同步文件、设置文件或日志。
- 远程更新按 Git 提交记录版本，更新前创建快照，网络不可用时可回退到本地快照。
- 卸载清理支持“清理全部”和“保留技能”两种模式；保留模式不会删除现有链接依赖的中央技能文件。

## 开发者指南

### 技术栈

- **桌面容器**：Tauri 2
- **前端**：React 19、TypeScript、Vite 8、Tailwind CSS 4
- **UI**：shadcn 风格的 source-owned Radix 组件、Lucide 图标、Zustand
- **后端**：Rust 2021、Tokio、Reqwest、Scraper、Serde、Keyring
- **网络与解析**：skills.sh 公共页面、GitHub 文件/树 API、HTML 详情解析

### 目录结构

```text
src/
├── app/             # 应用壳、导航和路由
├── components/      # 通用组件与 shadcn/Radix UI 原语
├── features/        # 技能、商店、导入、同步、迁移、设置等领域适配层
└── pages/           # 我的技能、商店、迁移、设置及导入对话框

src-tauri/src/
├── commands/        # Tauri IPC 命令
├── core/            # 与 Tauri 解耦的技能生命周期和领域逻辑
├── state/           # 应用状态与异步写锁
├── lib.rs           # Tauri 应用注册与命令注册
└── main.rs          # 瘦启动入口

docs/
├── specs/           # 需求、设计、架构、状态机和阶段规划
└── guides/          # 跨平台 QA 与发布前检查
```

安装、更新、回退、卸载、分发、迁移和同步等文件系统写操作由 Rust 负责；前端通过 Tauri commands 调用后端能力。不要在前端或脚本中直接实现技能安装、分发或卸载流程，也不要调用 `npx skills`。

### 常用检查

```bash
pnpm build
pnpm lint
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

Rust 依赖审计需要先安装 `cargo-audit`，然后在 `src-tauri` 目录运行：

```bash
cd src-tauri
cargo audit
```

### 前端约定

- 使用 Tailwind CSS v4 和项目现有的 CSS-first 主题 Token。
- 控件和覆盖层优先使用 `src/components/ui/` 中的 shadcn/Radix 原语。
- 滚动内容使用共享 `ScrollArea`，不要重新引入页面级原生滚动容器。
- 保持桌面端信息密度，不新增移动端适配要求。

## 项目文档

- [需求文档](./docs/specs/01-需求文档.md)
- [设计规范](./docs/specs/02-设计规范.md)
- [后端架构](./docs/specs/03-后端架构.md)
- [前端结构](./docs/specs/04-前端结构.md)
- [生命周期状态机](./docs/specs/05-生命周期状态机.md)
- [开发阶段规划](./docs/specs/06-开发阶段规划.md)
- [跨平台 QA 指南](./docs/guides/cross-platform-qa.md)

当前实现覆盖 Phase 1–7：从项目壳和核心生命周期，到商店、GitHub/本地导入、设置、同步、存量迁移、冲突处理、清理流程和跨平台 QA。
