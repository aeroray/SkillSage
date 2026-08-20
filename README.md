<div align="center">
  <img src="./skillsage-logo.png" alt="SkillSage Logo" width="120" />
  <h1>SkillSage</h1>
  <p>面向 Windows 和 macOS 的桌面端 AI Agent 技能管理器</p>

  <p>
    <a href="#功能概览">功能概览</a> ·
    <a href="#获取应用">获取应用</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="#开发者指南">开发者指南</a> ·
    <a href="#项目文档">项目文档</a>
  </p>
</div>

SkillSage 将 AI Agent 技能直接安装到各工具共用的 `~/.agents/skills/` 目录，并在本地维护版本、来源和快照信息。它适合需要统一安装、更新和维护技能的个人开发者与团队。

> [!NOTE]
> SkillSage 是桌面端软件，主窗口默认及最小尺寸为 `1200×800`，支持最大化，不面向移动端布局。

## 功能概览

- **我的技能**：查看已安装技能，执行更新、回退、卸载和按选择检查更新。
- **技能商店**：搜索 skills.sh，查看技能详情，并从商店或 GitHub 安装技能。
- **本地导入**：导入 `SKILL.md` 文件、技能目录，或包含单个技能目录的父目录。
- **共享目录管理**：Claude Code、Cursor、GitHub Copilot、OpenAI Codex CLI 和 OpenCode 可直接读取同一份技能内容。
- **采纳技能**：扫描 `~/.agents/skills/` 中未登记的真实技能目录，按 `SKILL.md` 名称安全采纳，并处理名称不一致或无效目录。
- **设置与同步**：配置代理、保存 GitHub Token 到系统密钥环，并导入或导出远程技能记录和非敏感应用设置。
- **可诊断性**：统一的加载/错误状态，以及写入平台应用日志目录的普通日志和 tracing 日志。

## 获取应用

稳定版本通过 [GitHub Releases](https://github.com/aeroray/SkillSage/releases) 发布：

- Windows：支持简体中文和 English 的 NSIS 安装包。
- macOS：Apple Silicon DMG 安装包。

应用启动后会异步检查一次更新；之后只有用户手动检查时才会再次请求。发现新版本后，可以从侧边栏或设置页直接安装。

## 快速开始

### 从源码运行

开发环境需要 Node.js 22+、pnpm、Rust stable，以及 Tauri 2 的桌面构建依赖。

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

SkillSage 将技能内容与管理数据分开保存：

| 数据 | 位置 |
| --- | --- |
| 共享技能目录 | `~/.agents/skills/` |
| 技能锁定记录 | `~/.skillsage/lock/skill-lock.json` |
| 更新快照与临时文件 | `~/.skillsage/lock/snapshots/`、`~/.skillsage/tmp/` |
| 同步数据文件 | 用户在导出时选择的位置 |
| 代理配置 | `~/.skillsage/settings.json` |

- 技能会直接写入共享目录，不创建按工具区分的 junction、symlink 或复制品。
- 同步数据包含远程技能记录和非敏感应用设置；GitHub Token 使用 Windows 凭据管理器或 macOS Keychain 保存，不写入同步文件、设置文件或日志。
- 远程更新按 Git 提交记录版本，更新前创建快照，网络不可用时可回退到本地快照。
- 移除应用不会修改共享技能目录；如需删除技能，请在“我的技能”中单独卸载。

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
├── features/        # 技能、商店、导入、同步、采纳、设置等领域适配层
└── pages/           # 我的技能、商店、采纳、设置及导入对话框

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

安装、更新、回退、卸载、采纳和同步等文件系统写操作由 Rust 负责；前端通过 Tauri commands 调用后端能力。不要在前端或脚本中直接实现技能安装、采纳或卸载流程，也不要调用 `npx skills`。

### 常用检查

```bash
pnpm build
pnpm lint
pnpm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

Rust 依赖审计需要先安装 `cargo-audit`，然后在 `src-tauri` 目录运行：

```bash
cargo install cargo-audit
cargo audit --manifest-path src-tauri/Cargo.toml
```

### 前端约定

- 使用 Tailwind CSS v4 和项目现有的 CSS-first 主题 Token。
- 控件和覆盖层优先使用 `src/components/ui/` 中的 shadcn/Radix 原语。
- 滚动内容使用共享 `ScrollArea`，不要重新引入页面级原生滚动容器。
- 保持桌面端信息密度，不新增移动端适配要求。

### GitHub Release

发布 workflow 位于 [`release.yml`](./.github/workflows/release.yml)。推送 `v` 开头的 SemVer 标签（例如 `v0.1.0`）后，GitHub Actions 会：

- 构建 Windows NSIS 安装包，安装器支持简体中文和 English。
- 构建 Apple Silicon macOS DMG，并同时生成应用内更新所需的签名产物。
- 创建 GitHub Release、上传 `latest.json`，让 Windows 和 macOS 客户端都能检查并安装更新。

在仓库的 Actions secrets 中配置 `TAURI_SIGNING_PRIVATE_KEY`。使用 Tauri signer 生成密钥后，只复制私钥内容到 GitHub Secret，不能提交到仓库。`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 只有在私钥设置了密码时才需要配置；对应的公钥已经写入 Tauri 配置。

SkillSage 不发布到 Mac App Store，而是直接通过 GitHub Release 提供 Apple Silicon DMG。macOS 签名和公证不是 Tauri 自动更新签名的替代品，而是用于减少 Gatekeeper 的首次启动拦截；它们通过 workflow 中的 `APPLE_*` secrets 可选配置。未配置时仍可生成未签名 DMG，但用户首次打开可能需要在 Finder 中右键选择“打开”，或执行：

```bash
xattr -rd com.apple.quarantine /Applications/SkillSage.app
```

`xattr` 只会移除当前电脑上的隔离标记，不能证明应用来源，也不能替代 Apple 签名和公证，适合作为开源测试包的启动说明。Tauri 的 `TAURI_SIGNING_PRIVATE_KEY` 仍会保护应用内更新包的完整性。

## 项目文档

- [跨平台 QA 指南](./docs/guides/cross-platform-qa.md)

当前桌面端已覆盖商店、GitHub/本地导入、版本管理、设置、同步、技能采纳和冲突处理等核心流程，并采用单一共享技能目录模型。历史规格和设计草稿已移除，避免与实际代码形成两套标准。
