# 跨平台 QA 清单

SkillSage 是桌面端应用，主窗口默认和最小尺寸均为 1200×800；允许最大化，不以移动端断点作为验收目标。

## 自动验证

在 Windows 和 macOS 上都运行：

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm build
pnpm exec tauri build --debug --no-bundle
```

这些检查目前通过本地命令执行；GitHub Actions 仅保留发布 workflow，发布前由 Windows/macOS runner 构建安装包并生成 updater artifacts。

## 手工走查

1. 确认窗口不能缩小到 1200×800 以下，最大化后导航、列表和对话框仍可用。
2. 走查商店无网络、搜索失败、详情失败、GitHub 限流、未配置 Token、代理错误等错误路径；错误提示应包含重试或设置入口。
3. 走查管理页首次加载、无技能、筛选无结果、更新失败、安装冲突和单个技能卸载失败状态。
4. 走查本地导入、GitHub URL、同步导入和存量技能采纳页面的加载、空结果和错误状态；确认名称冲突可整理、无效安全目录可移除。
5. 确认应用移除不会改动共享技能目录；需要删除内容时，只能从“我的技能”对单个技能执行卸载。
6. 验证键盘焦点、Escape 关闭对话框、错误区域的 `role=alert` 和 `prefers-reduced-motion` 行为。
7. Windows NSIS 与 macOS Finder 的卸载时机不同，验证系统移除应用后共享技能目录仍保持不变。

## 日志反馈

日志位于 Tauri 平台应用日志目录：Windows 通常是 `%LOCALAPPDATA%/com.skillsage.desktop/logs/`，macOS 通常是 `~/Library/Logs/com.skillsage.desktop/`。反馈问题时可附上 `skillsage.log` 和 `skillsage-trace.log`，不要附带 Token 或整个凭据目录。
