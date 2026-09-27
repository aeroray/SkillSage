<div align="center">
  <img src="./skillsage-logo.png" alt="SkillSage Logo" width="120" />
  <h1>SkillSage · 技匠</h1>
  <p>面向 Windows 和 macOS 的桌面端 AI Agent 技能管理器</p>

  <p>
    <a href="#功能概览">功能概览</a> ·
    <a href="#获取应用">获取应用</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="#开发者指南">开发者指南</a> ·
    <a href="#项目文档">项目文档</a>
  </p>
</div>

技匠（SkillSage）将 AI Agent 技能直接安装到各工具共用的 `~/.agents/skills/` 目录，并在本地维护来源、提交和内容指纹信息。它适合需要统一安装、更新和维护技能的个人开发者与团队。

> [!NOTE]
> SkillSage 是桌面端软件，主窗口默认及最小尺寸为 `1200×800`，支持最大化，不面向移动端布局。

## 功能概览

- **我的技能**：查看已安装技能，执行更新、卸载和按选择检查更新。
- **技能商店**：搜索 skills.sh，查看技能详情，并从商店或 GitHub 安装技能。
- **本地导入**：导入 `SKILL.md` 文件、技能目录，或包含单个技能目录的父目录。
- **本地技能在线匹配**：对 `local://` 技能主动搜索 skills.sh 的名称匹配候选，并用本地目录指纹核对远端当前内容；完全一致的候选会优先推荐。确认后只链接远端来源记录，不替换现有本地文件，并启用后续更新。
- **共享目录管理**：技能只安装一份，放在 `~/.agents/skills/`；Zed、Cursor、GitHub Copilot、OpenCode、Amp、Gemini CLI 等工具可直接读取。
- **工具分发**：不读取共享目录的工具（Claude Code、CodeBuddy/WorkBuddy、Codex、Cline 等）按需在各自技能目录建立链接。工具清单内置约 27 项并自动检测本机安装情况；每个工具的「读取公共技能目录」开关可在设置页修改，勾选后即不再对其分发。
- **采纳技能**：扫描 `~/.agents/skills/` 中未登记的真实技能目录，按 `SKILL.md` 名称安全采纳，并处理名称不一致或无效目录。
- **设置与同步**：配置代理、保存 GitHub Token 到系统密钥环，并导入或导出远程技能记录和非敏感应用设置。
- **可诊断性**：统一的加载/错误状态，以及写入平台应用日志目录的普通日志和 tracing 日志。

## 获取应用

稳定版本通过 [GitHub Releases](https://github.com/aeroray/SkillSage/releases) 发布：

- Windows：支持简体中文和 English 的 NSIS 安装包。
- macOS：Apple Silicon DMG 安装包。

应用启动后会异步检查一次更新；之后只有用户手动检查时才会再次请求。发现新版本后，可以从侧边栏或设置页直接安装。

### 更新源与国内加速

GitHub 的 release 下载在国内经常不可达或极慢，因此检查更新时会**并发请求全部镜像节点与 GitHub 直连**，取第一个返回有效清单的源：

| 节点 | 说明 |
| --- | --- |
| `gh.catmak.name` | 实测最快 |
| `cdn.akaere.online` | |
| `fastgit.cc` | |
| `githubdog.com` | |
| `github.geekery.cn` | |
| GitHub 直连 | 与镜像同时竞速，海外用户不受影响 |

节点清单见 `src-tauri/src/core/mirrors.rs` 的 `MIRRORS`，可随时增删。竞速而非固定某一个，是因为这些节点由网友提供、会无预警失效——固定一个最终会同时对所有人失效。

安装包同样走胜出的节点。由于各节点**只代理清单、不重写其中的下载地址**（仍指向 `api.github.com`，而多数节点会拒绝该形式），下载地址会被改写为节点的 `releases/download/<tag>/<file>` 形式；改写失败时回退到原地址，不会让更新失败。

**安全**：镜像只承担传输，安装包仍由 Tauri updater 用配置中的公钥做 minisign 签名校验。被篡改的镜像只会导致签名失败，无法安装。

维护者可用 `cargo test --test mirrors_live -- --ignored --nocapture` 实测各节点可用性与下载链路（需要联网，默认不跑）。

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

### 应用版本

应用版本以 [`package.json`](./package.json) 中的 `version` 为唯一来源。Tauri 配置直接读取该字段；Cargo 版本由以下命令同步生成：

```bash
pnpm sync:version
```

`pnpm build` 会自动执行同步。发布标签必须与 `package.json` 的版本一致，例如 `package.json` 为 `1.0.0` 时推送 `v1.0.0`。

### Logo 维护

仓库根目录的 [`skillsage-logo.png`](./skillsage-logo.png) 是唯一 Logo 源文件。替换它后重新运行：

```bash
pnpm sync:branding
```

该命令会同步前端资源、favicon 和 Tauri 的 Windows/macOS 图标，并清理桌面版本不使用的移动端派生图标。

## 用户数据与安全边界

SkillSage 将技能内容与管理数据分开保存：

| 数据               | 位置                                                |
| ------------------ | --------------------------------------------------- |
| 共享技能目录       | `~/.agents/skills/`                                 |
| 工具技能链接       | 各工具自己的技能目录，见下表                        |
| 技能锁定记录       | `~/.skillsage/lock/skill-lock.json`                 |
| 更新临时文件       | `~/.skillsage/tmp/`                                  |
| 同步数据文件       | 用户在导出时选择的位置                              |
| 代理配置           | `~/.skillsage/settings.json`                        |

技能内容直接写入共享目录。已经读取共享目录的工具不需要任何额外操作；其余工具会在其自身技能目录中创建一个指向共享目录的目录链接，不复制技能内容。

| 工具                | 技能目录                    | 读取共享目录 |
| ------------------- | --------------------------- | ------------ |
| Claude Code         | `~/.claude/skills`          | 否           |
| CodeBuddy / WorkBuddy | `~/.codebuddy/skills`     | 否           |
| OpenAI Codex CLI    | `~/.codex/skills`           | 否           |
| Cline               | `~/.cline/skills`           | 否           |
| Cursor              | `~/.cursor/skills`          | 是           |
| GitHub Copilot      | `~/.copilot/skills`         | 是           |
| OpenCode            | `~/.config/opencode/skills` | 是           |
| Zed                 | 无独立目录                  | 是           |

完整清单（约 27 个工具）位于 `src-tauri/src/core/tools.rs`，每个条目都带有技能目录、是否读取共享目录、依据的文档地址以及该依据是否来自官方文档。**「读取共享目录」可以在设置页逐个工具修改**：某个工具将来开始支持共享目录时，勾选后即不再对它分发，已有的链接会被移除。

- 工具分发在 Windows 使用 directory junction，在 macOS 使用 symlink；取消分发或卸载时只删除 SkillSage 确认归属的链接。
- 只有**本机已检测到**的工具会出现在技能行的分发列表中；设置页则列出完整清单，未安装的工具也可手动指定目录。
- 同步数据包含远程技能记录和非敏感应用设置；GitHub Token 使用 Windows 凭据管理器或 macOS Keychain 保存，不写入同步文件、设置文件或日志。
- 远程技能保留当前 Git 提交和内容指纹，用于检查更新以及在同步导入时恢复对应内容；不维护版本历史或本地快照。
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
├── guides/          # 跨平台 QA 与发布前检查
└── memory/          # 项目长期约束与已确认决策
```

安装、更新、卸载、采纳和同步等文件系统写操作由 Rust 负责；前端通过 Tauri commands 调用后端能力。不要在前端或脚本中直接实现技能安装、采纳或卸载流程，也不要调用 `npx skills`。

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

发布 workflow 位于 [`release.yml`](./.github/workflows/release.yml)。推送 `v` 开头的 SemVer 标签（例如 `v1.0.0`）后，GitHub Actions 会：

- 构建 Windows NSIS 安装包，安装器支持简体中文和 English。
- 构建 Apple Silicon macOS DMG，并同时生成应用内更新所需的签名产物。
- 创建 GitHub Release、上传 `latest.json`，让 Windows 和 macOS 客户端都能检查并安装更新。

在仓库的 Actions secrets 中配置 `TAURI_SIGNING_PRIVATE_KEY`。使用 Tauri signer 生成密钥后，只复制私钥内容到 GitHub Secret，不能提交到仓库。`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 只有在私钥设置了密码时才需要配置；对应的公钥已经写入 Tauri 配置。

SkillSage 不发布到 Mac App Store，而是直接通过 GitHub Release 提供未签名的 Apple Silicon DMG。macOS 签名和公证不是 Tauri 自动更新签名的替代品，本项目的开源发布 workflow 不依赖 Apple 开发者证书；用户首次打开可能需要在 Finder 中右键选择“打开”，或执行：

```bash
xattr -rd com.apple.quarantine /Applications/SkillSage.app
```

`xattr` 只会移除当前电脑上的隔离标记，不能证明应用来源，也不能替代 Apple 签名和公证，适合作为开源测试包的启动说明。Tauri 的 `TAURI_SIGNING_PRIVATE_KEY` 仍会保护应用内更新包的完整性。

## 项目文档

- [跨平台 QA 指南](./docs/guides/cross-platform-qa.md)

当前桌面端已覆盖商店、GitHub/本地导入、技能更新、设置、同步、技能采纳和冲突处理等核心流程，并采用单一共享技能目录模型。历史规格和设计草稿已移除，避免与实际代码形成两套标准。
