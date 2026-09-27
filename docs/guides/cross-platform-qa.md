# 跨平台 QA 清单

技匠（SkillSage）是桌面端应用，主窗口默认和最小尺寸均为 1200×800；允许最大化，不以移动端断点作为验收目标。

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
4. 在 Windows 和 macOS 各分发一个技能到本机已检测到的工具：确认“分发到工具”菜单只列出已安装的工具，切换某一项后只有该工具的链接被创建或删除；链接指向共享技能目录，已有外部目录或链接时应拒绝覆盖。
5. 在设置页的「AI 工具与分发」中：确认列出完整工具清单、已安装工具带「已安装」标记、未核实路径的工具带「路径未核实」标记；勾选某个工具的「读取公共技能目录」后，该工具从其技能行与批量分发菜单中消失，且已有链接被移除；取消勾选后重新出现。自定义目录应即时生效并可「恢复默认」。
6. 走查本地导入、GitHub URL、同步导入和存量技能采纳页面的加载、空结果和错误状态；确认名称冲突可整理、无效安全目录可移除。
7. 对 `local://` 技能从菜单主动执行在线匹配：验证查询中、无候选、多个候选、内容完全一致、内容不一致、无法验证、错误和确认绑定状态；确认候选显示作者/仓库/路径和安装量，完全一致者置顶，绑定只更新锁文件、保留本地目录，并使后续更新可用。
8. 确认应用移除不会改动共享技能目录；需要删除技能时，从“我的技能”卸载并确认对应工具的链接也被清理。
9. 升级路径：用一个旧版本产生的 `version: 2` 锁文件启动，确认技能列表保留、原 Claude Code / Work Buddy 分发状态迁移为工具 id 列表，且保存后旧字段不再出现。
10. 验证键盘焦点、Escape 关闭对话框、错误区域的 `role=alert` 和 `prefers-reduced-motion` 行为。
11. Windows NSIS 与 macOS Finder 的卸载时机不同，验证系统移除应用后共享技能目录仍保持不变。

## 日志反馈

日志位于 Tauri 平台应用日志目录：Windows 通常是 `%LOCALAPPDATA%/com.skillsage.desktop/logs/`，macOS 通常是 `~/Library/Logs/com.skillsage.desktop/`。反馈问题时可附上 `skillsage.log` 和 `skillsage-trace.log`，不要附带 Token 或整个凭据目录。
