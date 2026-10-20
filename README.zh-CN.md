<div align="center">
  <img src="./skillsage-logo.png" alt="SkillSage 技匠 Logo" width="120" />
  <h1>技匠 · SkillSage</h1>
  <p>面向 Windows 和 macOS 的 AI Agent 技能管理器</p>

  <p>
    <a href="./README.md">English</a> ·
    <b>简体中文</b>
  </p>

  <p>
    <a href="https://github.com/aeroray/SkillSage/releases"><img src="https://img.shields.io/github/v/release/aeroray/SkillSage?sort=semver" alt="最新版本" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="许可证：MIT" /></a>
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg" alt="平台：Windows 与 macOS" />
  </p>

  <p>
    <a href="#功能概览">功能概览</a> ·
    <a href="#获取应用">获取应用</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="#数据与安全边界">数据</a> ·
    <a href="#开发者指南">开发者指南</a> ·
    <a href="#许可证">许可证</a>
  </p>
</div>

技匠（SkillSage）把 AI Agent 技能安装到各工具本就读取的共享目录 `~/.agents/skills/`，并
记录每个技能的来源仓库、提交和内容指纹。不读取该目录的工具会得到一个受管理的目录链接，而
不是第二份副本。它面向需要在多个 Agent 之间统一安装、更新和核查技能、又不想为每个工具各存
一份内容的开发者。

> [!NOTE]
> 技匠是桌面端应用。主窗口以 `1200×800` 打开，且不会缩小到该尺寸以下，支持最大化。没有移
> 动端布局。

## 功能概览

- **我的技能** —— 查看已安装技能，执行更新、卸载，并对任意选中项检查更新。
- **技能商店** —— 搜索 skills.sh、查看技能详情，并从商店或 GitHub URL 安装。
- **本地导入** —— 导入 `SKILL.md` 文件、技能目录，或包含单个技能目录的父目录。
- **本地技能在线匹配** —— 对 `local://` 技能主动搜索 skills.sh 的名称匹配候选，并用本地目录
  指纹核对远端当前内容；内容完全一致的候选会优先推荐。确认后只登记远端来源，不替换本地文件，
  并启用后续更新。
- **单一共享目录** —— 每个技能只安装一份，位于 `~/.agents/skills/`。已经读取该目录的工具无需
  任何额外操作即可使用。
- **按工具分发** —— 只读取自身目录的工具（Claude Code、CodeBuddy/WorkBuddy、Codex、Cline 等）
  会在各自的技能目录中得到一个链接。内置注册表覆盖 27 个工具，自动检测本机安装情况，并允许在
  设置页逐个工具修改「读取共享目录」标记。
- **采纳技能** —— 扫描共享目录中真实存在但未登记的技能目录，在文件夹名与 `SKILL.md` 声明名
  一致后就地采纳；名称不一致可显式修复，无效条目可显式移除。
- **设置与同步** —— 配置代理、把 GitHub Token 保存到系统密钥环，并导入或导出远程技能记录和
  非敏感应用设置。
- **可诊断** —— 统一的加载与错误状态，普通日志和结构化日志写入平台的应用日志目录。

## 获取应用

稳定版本通过 [GitHub Releases](https://github.com/aeroray/SkillSage/releases) 发布：

- **Windows** —— NSIS 安装包，界面支持简体中文和 English。
- **macOS（Apple Silicon）** —— DMG 安装包。

应用启动后会异步检查一次更新，之后只有你主动检查时才会再次请求。发现新版本后，可以从侧边栏
或设置页安装。

macOS 版本没有使用 Apple 开发者证书签名或公证——这是不依赖证书的开源发布。首次打开时，
macOS 可能要求右键点击应用并选择**打开**，或执行：

```bash
xattr -rd com.apple.quarantine /Applications/SkillSage.app
```

该命令只会移除当前电脑上的隔离标记，不能证明应用来源，也不能替代 Apple 签名。应用内更新包仍
由 Tauri 自身的签名密钥保护。

### 更新源与镜像

GitHub 的 release 下载在国内经常不可达或极慢，因此检查更新时会**并发请求全部镜像节点与
GitHub 直连**，取第一个返回有效清单的源：

| 源 | 说明 |
| --- | --- |
| `gh.catmak.name` | 实测最快 |
| `cdn.akaere.online` | |
| `fastgit.cc` | |
| `githubdog.com` | |
| `github.geekery.cn` | |
| GitHub 直连 | 与镜像同时竞速，海外用户不受影响 |

节点清单位于 `src-tauri/src/core/mirrors.rs` 的 `MIRRORS`，可随时增删。竞速而非固定某一个，
是因为这些节点由网友提供、会无预警失效——固定一个最终会同时对所有人失效。

安装包同样走胜出的节点。由于各节点**只代理清单、不重写其中的下载地址**（仍指向
`api.github.com`，而多数节点会拒绝该形式），下载地址会被改写为节点的
`releases/download/<tag>/<file>` 形式；改写失败时回退到原地址，而不是让更新失败。

**安全** —— 镜像只承担传输。安装包仍会用 Tauri 配置中的 minisign 公钥校验，被篡改的镜像只会
导致签名失败，无法安装。此外下载到的安装包长度会与 GitHub 上该版本发布的元数据交叉核对，因此
镜像无法用旧版签名包冒充新版本。

维护者可用 `cargo test --test mirrors_live -- --ignored --nocapture` 实测各节点（需要联网，
默认不运行）。

## 快速开始

### 从源码运行

需要 Node.js 22+、pnpm、Rust stable，以及你所在平台的
[Tauri 2 前置依赖](https://tauri.app/start/prerequisites/)。

```bash
pnpm install
pnpm exec tauri dev
```

`pnpm dev` 只启动 Vite 浏览器预览（带示例数据的界面外壳）；完整桌面能力请使用
`pnpm exec tauri dev`。

### 构建桌面应用

```bash
pnpm exec tauri build
```

如需只验证构建而不生成安装包：

```bash
pnpm exec tauri build --debug --no-bundle
```

### 应用版本

[`package.json`](./package.json) 中的 `version` 是唯一来源。Tauri 配置直接读取该字段，
Cargo 版本由以下命令同步生成：

```bash
pnpm sync:version
```

`pnpm build` 会自动执行同步。发布标签必须与 `package.json` 一致——版本为 `1.0.0` 时推送
`v1.0.0`。

### Logo 维护

仓库根目录的 [`skillsage-logo.png`](./skillsage-logo.png) 是唯一 Logo 源文件。替换后运行：

```bash
pnpm sync:branding
```

该命令会重新生成前端资源、favicon 和 Windows/macOS 图标集，并清理桌面版本不使用的移动端派生
图标。

## 数据与安全边界

技能内容与技匠自身的管理数据分开保存：

| 数据 | 位置 |
| --- | --- |
| 共享技能目录 | `~/.agents/skills/` |
| 各工具技能链接 | 各工具自己的技能目录 |
| 技能锁定记录 | `~/.skillsage/lock/skill-lock.json` |
| 更新临时文件 | `~/.skillsage/tmp/` |
| 同步数据文件 | 你在导出时选择的位置 |
| 代理配置 | `~/.skillsage/settings.json` |

技能内容直接写入共享目录。读取该目录的工具无需任何额外操作；其余工具会在自身技能目录中得到一
个指向共享目录的链接，技能内容不会被复制。

| 工具 | 技能目录 | 读取共享目录 |
| --- | --- | --- |
| Claude Code | `~/.claude/skills` | 否 |
| CodeBuddy / WorkBuddy | `~/.codebuddy/skills` | 否 |
| OpenAI Codex CLI | `~/.codex/skills` | 否 |
| Cline | `~/.cline/skills` | 否 |
| Cursor | `~/.cursor/skills` | 是 |
| GitHub Copilot | `~/.copilot/skills` | 是 |
| OpenCode | `~/.config/opencode/skills` | 是 |
| Gemini CLI | `~/.gemini/skills` | 是 |
| Amp | `~/.config/amp/skills` | 是 |

完整清单（27 个工具）位于 `src-tauri/src/core/tools.rs`。每个条目都带有技能目录、是否读取共
享目录、依据的文档地址，以及该依据是否来自官方文档。**「读取共享目录」可在设置页逐个工具修
改**：某个工具将来开始支持共享目录时，勾选后即不再对它分发，已有的链接会被移除。

- 分发在 Windows 使用 directory junction，在 macOS 使用 symlink。取消分发或卸载时只删除
  技匠确认由自己创建的链接。
- 只有**本机已检测到**的工具会出现在技能的分发菜单中；设置页列出完整清单，因此未检测到的工具
  仍可手动指定目录。
- 同步数据包含远程技能记录和非敏感设置。GitHub Token 保存在 Windows 凭据管理器或 macOS
  钥匙串中，不会进入同步文件、设置文件或日志。
- 远程技能记录当前 Git 提交和内容指纹，用于检查更新以及在另一台设备上恢复相同内容。版本历史
  和本地快照是刻意不维护的。
- 移除应用不会改动共享目录。如需删除技能，请在**我的技能**中卸载。

## 开发者指南

### 技术栈

- **桌面容器** —— Tauri 2
- **前端** —— React 19、TypeScript、Vite 8、Tailwind CSS 4
- **UI** —— 源码自有的 shadcn 风格 Radix 原语、Lucide 图标、Zustand
- **后端** —— Rust 2021、Tokio、Reqwest、Scraper、Serde、Keyring
- **网络与解析** —— skills.sh 公共页面、GitHub contents/tree API、HTML 详情解析

### 目录结构

```text
src/
├── app/             # 应用壳、导航和路由
├── components/      # 通用组件与 shadcn/Radix 原语
├── features/        # 领域适配层：技能、商店、导入、同步、采纳、设置
└── pages/           # 我的技能、商店、采纳、设置、导入对话框

src-tauri/src/
├── commands/        # Tauri IPC 命令
├── core/            # 与 Tauri 解耦的技能生命周期和领域逻辑
├── state/           # 应用状态与异步写锁
├── lib.rs           # Tauri 应用与命令注册
└── main.rs          # 瘦启动入口

docs/
├── DESIGN.md        # 设计系统（token、布局、组件）
├── guides/          # 跨平台 QA 与发布前检查
├── releases/        # 发布说明，每个标签一个文件
└── memory/          # 项目长期约束与已确认决策
```

安装、更新、卸载、采纳、同步等文件系统写入由 Rust 负责，前端通过 Tauri 命令调用。不要在前端
或脚本中实现技能的安装、采纳或卸载，也不要调用 `npx skills`。

### 常用检查

```bash
pnpm build
pnpm lint
pnpm test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

Rust 依赖审计需要先安装 `cargo-audit`：

```bash
cargo install cargo-audit
cargo audit --manifest-path src-tauri/Cargo.toml
```

当前没有用 `cargo fmt --check` 做格式门禁——本版本的工作树并非 rustfmt 干净状态，启用它意味着
一次全仓重排。

### 前端约定

- 使用 Tailwind CSS v4 和项目现有的 CSS-first 主题 Token。
- 控件与覆盖层优先使用 `src/components/ui/` 中的 shadcn/Radix 原语。
- 滚动内容使用共享 `ScrollArea`，不要重新引入页面级原生滚动容器。
- 保持桌面端信息密度，不新增移动端布局要求。

### 发布

发布 workflow 位于 [`release.yml`](./.github/workflows/release.yml)。推送 `v` 开头的 SemVer
标签（例如 `v1.0.0`）后，GitHub Actions 会：

- 构建 Windows NSIS 安装包，界面支持简体中文和 English；
- 构建 Apple Silicon macOS DMG，并同时生成应用内更新所需的签名产物；
- 创建 GitHub Release 并上传 `latest.json`，让 Windows 和 macOS 客户端都能检查并安装更新。

发布说明写在 `docs/releases/<tag>.md`。workflow 会读取该文件，缺失或为空即失败，因此说明不会
被静默沿用上一个版本。

在仓库的 Actions secrets 中配置 `TAURI_SIGNING_PRIVATE_KEY`。用 Tauri signer 生成密钥对后，
只把私钥内容复制到 secret，绝不提交到仓库。`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 仅在私钥设
置了密码时需要配置；对应公钥已写入 Tauri 配置。

## 项目文档

- [跨平台 QA 指南](./docs/guides/cross-platform-qa.md)
- [设计系统](./docs/DESIGN.md)
- [发布说明](./docs/releases)

桌面端已覆盖商店、GitHub 与本地导入、技能更新、设置、同步、技能采纳和冲突处理，并建立在单一
共享目录模型之上。历史规格与设计草稿已移除，避免代码与文档形成两套标准。

## 许可证

[MIT](./LICENSE) © SkillSage contributors
