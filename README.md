# SkillSage

SkillSage 是一款面向 Windows 和 macOS 的 Tauri 2 桌面端 AI Agent 技能管理器。它把技能保存在用户目录下的中央仓库，再通过 Windows junction 或 macOS symlink 分发到用户选择的工具目录。

当前实现覆盖 Phase 1–7：商店发现、远程/GitHub/本地安装、技能更新与回退、分发管理、同步清单、存量迁移、冲突处理、错误与加载状态、应用数据清理以及本地日志。

## 开发

环境要求：Node.js、pnpm、Rust stable，以及 Tauri 2 的桌面构建依赖。

```bash
pnpm install
pnpm dev                 # 仅启动 Vite 浏览器预览
pnpm exec tauri dev     # 启动桌面应用
pnpm build
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml
pnpm exec tauri build --debug --no-bundle
```

Vite 已忽略 `src-tauri/**`，避免 Windows Rust 构建产物被开发服务器递归监听而触发 `EBUSY`。

## 数据与日志

- 中央仓库：`~/.skillsage/remote/` 和 `~/.skillsage/local/`
- 管理记录：`~/.skillsage/lock/skill-lock.json`
- 同步导出：`~/.skillsage/exports/`
- 应用日志：Tauri 的平台日志目录中的 `skillsage.log` 和 `skillsage-trace.log`

Token 不写入项目设置文件，也不会写入日志；它使用 Windows 凭据管理器或 macOS Keychain 保存。代理配置保存在 `~/.skillsage/settings.json`。

## 卸载前的数据清理

设置页的“准备卸载”提供两种选择：

- “清理全部”删除中央仓库、SkillSage 创建的分发链接、lock、代理设置和凭据。
- “保留技能”保留中央技能文件和现有链接，只删除 SkillSage 的 lock、导出、临时文件、代理设置和凭据，让 AI 工具继续使用技能但不再由 SkillSage 管理。

保留模式不会删除中央仓库，因为现有链接依赖它；删除中央仓库会让这些链接立即失效。这是对卸载安全性的明确约束。

Windows NSIS 和 macOS Finder 删除应用的时机由操作系统/安装器控制，应用不能可靠地在所有平台自动弹出同一个清理 UI。因此正式卸载前请先打开设置页执行“准备卸载”；跨平台自动化卸载钩子仍属于发布集成验证项。

## 项目文档

完整需求、设计规范、后端架构、前端结构、生命周期状态机和开发阶段规划位于 [`docs/specs/`](docs/specs/)。跨平台验证清单见 [`docs/guides/cross-platform-qa.md`](docs/guides/cross-platform-qa.md)。
