---
name: SkillSage · 技匠
description: 面向 Windows 与 macOS 的 AI Agent 技能管理器，安静、精确、可预期的桌面工具界面
colors:
  deep-teal: "#0d9488"
  deep-teal-text: "#0a7d70"
  bright-teal: "#75e6d7"
  slate-blue-gray: "#5f6c7e"
  ink: "#17202a"
  paper: "#f5f6f8"
  card-light: "#ffffff"
  muted-light: "#eef1f4"
  border-light: "#e1e6eb"
  oled-black: "#0b0d11"
  card-dark: "#11161d"
  muted-dark: "#171d25"
  border-dark: "#29313b"
  muted-foreground-dark: "#8b96a3"
  success-light: "#0f9f94"
  success-text-light: "#0b7a6f"
  warning-light: "#b7791f"
  warning-text-light: "#8f5d11"
  destructive-light: "#c2413d"
  destructive-text-light: "#b23b37"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "0.5rem"
  md: "0.625rem"
  lg: "0.875rem"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.deep-teal}"
    textColor: "{colors.card-light}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.card-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.muted-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-blue-gray}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "rgba(194, 65, 61, 0.1)"
    textColor: "{colors.destructive-text-light}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  badge-default:
    backgroundColor: "#e5f8f5"
    textColor: "{colors.deep-teal-text}"
    rounded: "{rounded.full}"
    padding: "0 8px"
    height: "20px"
  badge-muted:
    backgroundColor: "{colors.muted-light}"
    textColor: "{colors.slate-blue-gray}"
    rounded: "{rounded.full}"
    padding: "0 8px"
    height: "20px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
---

# Design System: SkillSage · 技匠

## Overview

**Creative North Star: 「安静的技匠工作台」(The Quiet Workshop)**

SkillSage 管理的是用户机器上一个**真实存在、所有 AI 工具都会读取**的共享目录。这个事实决定了整套界面的性格：这里的每一次点击都可能让某个技能在所有工具里消失。所以界面不追求吸引注意力，而是追求**让后果在动作发生之前就被看清**。

视觉上它是一件称手的工具，不是一个仪表盘。密度偏高但不拥挤：信息按「一屏能扫完」来组织，而不是按「一屏能塞下」来组织。颜色极度克制——整页通常只有一个青色出现，用于当前选中项或唯一的主操作；其余全部交给中性灰阶和留白。这里没有渐变、没有玻璃拟态、没有装饰性阴影；层次由**边框和表面色差**承担，阴影只用于真正浮起的层（弹窗、下拉、Toast）。

深浅两套主题不是同一套配色的反相，而是两个使用场景：浅色是白天办公室里的安静工具，深色是 OLED 屏上的工作台。两者共用同一套语义 token，因此组件代码从不感知主题。

**Key Characteristics:**
- 后果优先：破坏性操作必须显示**具体影响范围**（哪些技能、多少个），而不是抽象警告。
- 一个页面一个青色：主色只标记「当前」和「唯一主操作」，其余用中性色。
- 边框分层而非阴影分层：静态表面用 `1px` 边框 + 表面色差，阴影只给浮层。
- 状态必须真实：说不清楚的结论用专门的「无更新源」，绝不谎报「已是最新」。
- 全部文本 ≥ 4.5:1，含浅色模式的次要文字。

## Colors

整块调色板只有**一个色相家族**（青）+ 一套蓝灰中性色；状态色仅在表达状态时出现。

### Primary
- **深青 (Deep Teal)** (`#0d9488`): 主色填充。用于主按钮背景、选中复选框、焦点环、导航激活态的浅色底。是页面上唯一的高饱和色块。
- **深青·文字 (Deep Teal Text)** (`#0a7d70`): 主色的**文字**版本。凡是把青色当文字用（激活的导航项、Badge 文字、链接），都用它而不是 `#0d9488`——后者在浅色底上只有 3.40:1。
- **明亮青 (Bright Teal)** (`#75e6d7`): 深色模式下的主色。深色底上它有 8.35:1，因此文字与填充共用同一个值。

### Neutral
- **墨 (Ink)** (`#17202a`): 浅色模式正文与标题。对 `#f5f6f8` 达 15.21:1。
- **纸 (Paper)** (`#f5f6f8`): 浅色模式页面底色。刻意不是纯白，让卡片能靠色差浮起。
- **卡面 (Card)** (`#ffffff`): 浅色卡片、输入框、弹窗表面。
- **石板蓝灰 (Slate Blue Gray)** (`#5f6c7e`): 次要文字、占位符、图标。**不是** `#718096`：那个值在浅色三个表面上只有 3.54–4.02:1，不达标。当前值实测 4.71 / 4.94 / 5.34。
- **OLED 黑 (OLED Black)** (`#0b0d11`): 深色模式页面底色。
- **深色卡面 (Card Dark)** (`#11161d`): 深色卡片与弹窗，靠 6 级亮度差而非阴影浮起。

### Status
- **成功 (Success)** (`#0f9f94` 填充 / `#0b7a6f` 文字): 已分发、已保存、操作成功。
- **警告 (Warning)** (`#b7791f` 填充 / `#8f5d11` 文字): 需要用户整理或注意（如技能名不一致）。
- **危险 (Destructive)** (`#c2413d` 填充 / `#b23b37` 文字): 卸载、删除等不可逆动作。

### Named Rules
**「一个青色」规则。** 任意一屏内，主色只出现在「当前选中项」和「唯一主操作」上，不超过 10% 的面积。它的稀有就是它的意义——当青色出现时，用户不需要思考该看哪里。

**「文字色分离」规则。** 状态色有填充值和文字值两个 token。凡是渲染为文字（含 Badge、Toast、错误提示），一律用 `-text` 后缀的 token；`--color-success` 这类填充值在浅色模式下当文字只有 2.95:1。图标可以继续用填充值，因为图标是非文本内容，适用 3:1 门槛。

## Typography

**Display Font:** 系统无衬线栈（`-apple-system` → `Segoe UI` → `PingFang SC` → `Microsoft YaHei`）
**Body Font:** 同上
**Label/Mono Font:** 系统等宽栈，仅用于**代码、路径、版本号、提交哈希**等需要逐字符辨认的内容

**Character:** 完全依赖系统字体，没有自托管字体。这是刻意的：一个本地桌面工具应该看起来像系统的一部分，而不是一个网站。中英文混排由 `PingFang SC` / `Microsoft YaHei` 兜底，因此中文不会掉进衬线回退。字重只用到 400 / 500 / 600 三档，靠**字号和颜色**而不是字重来建立层级。

### Hierarchy
- **Display** (600, `1.5rem`, 1.25): 页面标题（`PageHeader`）。全站最大的字，每屏最多一个。
- **Title** (500, `1rem`, 1.375): 卡片标题、分组标题、技能名。
- **Body** (400, `0.875rem`, 1.5): 正文、描述、按钮文字。桌面端基础字号。
- **Label** (400, `0.75rem`, 1.5): 元信息、时间戳、计数、辅助说明。
- **Mono** (400, `0.75rem`): 路径、版本号、哈希。**仅**用于这类内容，不作为「技术感」的装饰。

### Named Rules
**「等宽即数据」规则。** 等宽字体只用于需要逐字符辨认的值（路径、哈希、版本）。不用它来营造技术气质。

**「字重不超三档」规则。** 只使用 400 / 500 / 600。层级由字号与颜色建立；再加字重会让密集列表变吵。

## Layout

固定桌面布局，最小窗口 `1200×800`，无移动端适配。左侧 `228px` 固定导航栏，右侧内容区居中，最大宽度 `1280px`，内边距 `32px`（`lg` 断点升至 `48px`）。

**页面本身永不滚动。** 外壳占满视口（`h-screen overflow-hidden`），每个页面是一个填满剩余高度的 flex 列：页头与工具栏固定在顶部，**只有列表区域滚动**。这样无论技能有多少，页头、搜索框、筛选器和操作栏都始终可达，也不会出现第二条滚动条。需要滚动的内容一律使用共享的 `ScrollArea`。

间距严格使用 4px 的倍数，实际只用到 6 档：`4 / 8 / 12 / 16 / 20 / 24`。节奏是「组内紧凑、组间宽松」——同一张卡片内元素相距 8–12px，卡片之间相距 16–24px。标题上方的空间永远大于下方。

列表采用**作者分组的手风琴**，而不是平铺表格：技能天然按来源仓库聚集，分组后同一仓库的多个技能只需读一次作者名。列表行使用 `grid`，在 `lg` 以上展开为 `复选框 / 主信息 / 来源 / 分发状态 / 操作` 五列。

### Named Rules
**「4 的倍数」规则。** 所有间距必须是 4px 的倍数。出现 6px、10px、14px 这类值说明间距是随手写的，不是决定的。

**「标题上方更宽」规则。** 任何标题与其上方元素的距离，必须大于它与下方内容正文的距离。

**「页面不滚动」规则。** 滚动永远发生在列表区域，不发生在页面上。页头、搜索、筛选和操作栏必须始终可见。新增页面时，把滚动放在内容列表上，而不是包一层整页滚动容器。

## Elevation & Depth

以**边框分层**为主、阴影为辅。静态表面（卡片、列表行、分组）一律使用 `1px` 边框加表面色差来建立层次，不使用阴影——因为一屏可能有十几个卡片，每个都带阴影会让界面立刻变脏。

阴影只用于**真正浮起、可以关闭的层**：弹窗、下拉菜单、Toast、Tooltip。这套区分是硬性的。

### Shadow Vocabulary
- **`shadow-sm`** (`0 1px 2px rgba(23,32,42,0.045)`): 卡片贴地的极轻投影。深色模式为 `rgba(0,0,0,0.24)`。仅用于 `Card`。
- **`shadow-lg`** (`0 18px 50px rgba(23,32,42,0.14)`): 浮层。大偏移 + 大模糊，表达「这个层离开了页面平面」。深色模式为 `rgba(0,0,0,0.42)`。

### Named Rules
**「浮层才投影」规则。** 阴影是「这一层可以关闭、且盖住了下方内容」的信号。静态内容用边框，不用阴影。零偏移的彩色光晕属于装饰，不在这套系统里。

**「深浅不是反相」规则。** 深色模式不是浅色模式取反：它降低表面亮度差（`#0b0d11` → `#11161d` → `#171d25`），同时提高文字对比度（正文 17.72:1）。深色下的主色换成明亮青，因为深青在 OLED 黑上不够亮。

## Shapes

圆角是**克制且成体系**的：`sm 8px` / `md 10px` / `lg 14px`，由 `--radius` 与 `--radius-lg` 两个 CSS 变量派生（`--radius-sm = radius - 2px`）。层级越高、面积越大，圆角越大：按钮和输入框用 `md`，卡片和弹窗用 `lg`，复选框用 `4px`（接近方形，表明它是可勾选的小控件）。

`Badge` 是唯一的完全圆角（`9999px`）元素——胶囊形让它一眼区别于方形的按钮，避免在小尺寸下与按钮混淆。

边框统一 `1px`，颜色比背景深一到两级（浅色 `#e1e6eb`，深色 `#29313b`）。没有 `2px` 及以上的边框，没有左侧色条，没有装饰性描边。

## Components

### Buttons
- **Shape:** 中等圆角（`10px` / `rounded-md`），高 `36px`，内边距 `16px`，图标与文字间距 `8px`。
- **Primary:** 深青底 + 白字。深色模式下**反转为浅色底 + 深字**（`dark:bg-foreground dark:text-background`）——OLED 上一块高饱和青色太刺眼，反转后用中性高对比承担主操作。
- **Hover / Focus:** 背景透明度变化（`hover:bg-primary/85`），`transition-colors`。焦点为 `2px` 主色环 + `border-ring`。
- **Outline:** 卡片底 + 边框，用于次级操作。**Ghost:** 无底无框，用于工具栏和行内操作。**Secondary:** 中性底，用于并列的非主要动作。**Destructive:** 危险色 10% 底 + 危险色文字，而不是实心红——卸载是重要但不该被误触的动作，实心红会过度吸引点击。

### Chips（筛选 ToggleGroup）
- **Style:** 未选中为透明底 + 常规文字；选中为 `bg-muted` + 前景色，圆角 `10px`，高 `28px`（`size="sm"`）。
- **State:** 单选。计数用**继承的前景色 + `opacity-80`** 渲染，而不是 `text-muted-foreground`——后者在 chip 底色上只有 3.54:1。计数为 0 的 chip 自动禁用。

### Cards / Containers
- **Corner Style:** `14px`（`rounded-lg`）。
- **Background:** 浅色 `#ffffff`，深色 `#11161d`。
- **Shadow Strategy:** 仅 `shadow-sm`，见 Elevation。
- **Border:** 恒有 `1px`。
- **Internal Padding:** `CardHeader` 为 `20px 16px`，`CardContent` 为 `0 20px`。

### Inputs / Fields
- **Style:** 透明底 + `1px` 边框，圆角 `10px`，高 `36px`。深色模式底色为 `input/30`。
- **Focus:** 边框转主色 + `2px` 主色环。
- **Disabled / Error:** 禁用降低不透明度；错误态边框转危险色并加危险色环。

### Navigation
- 左侧 `228px` 固定栏。项高 `40px`，圆角 `10px`，图标 16px + 文字。
- 默认态为蓝灰文字；hover 为中性底；**激活态为浅青底 + 深青文字**（深色下为深青底 + 明亮青文字）。这是「一个青色」规则最稳定的落点。

### Selection Action Bar（签名组件）
技能列表的工具栏在**有选中项时整体切换**为批量操作栏：`批量分发 · 检查更新(n) · 卸载(N)`，无选中时显示浏览态操作（`打开共享目录 · 更新全部 · 检查全部更新`）。

这是这套界面的核心交互决策：**选择本身没有意义，能对选择做什么才有意义**。因此每个动作按钮上的数字都是**该动作真正会作用的数量**，而不是选中总数——选中 4 个但只有 3 个有远端来源时，「检查更新」显示 3。用户不需要理解为什么数字对不上，因为界面上从未出现过一个会骗人的数字。

操作栏**不显示「已选 N 个」这类只读计数**，也**不提供「取消选择」**。每个按钮已经带着自己的数量，重复的计数只是噪音；而取消选择只要再点一次「全选」复选框即可，单独一个按钮是冗余。

### Segmented Range Control（签名组件）
技能商店的排行榜范围（热门 / 趋势 / 爆款）是**对同一个列表的单选过滤**，不是切换不同面板的标签页，因此用分段控件（`ToggleGroup`）而不是 `Tabs`。三个图标统一为中性色，只有激活段取强调色——三个不同颜色的图标会与内容争夺注意力，并破坏「一个青色」规则。

### Status Badge（签名组件）
技能的分发状态用图标 + 文字 + `sr-only` 状态词表达（`Claude Code 已分发`），而不是纯图标。因为 `<span>` 没有可命名的 ARIA role，`aria-label` 会被丢弃——状态必须是真的文字才能被屏幕阅读器读到。

## Do's and Don'ts

### Do:
- **Do** 让每个批量操作按钮显示它**真正会作用的数量**（`卸载（4）`、`检查更新（3）`），即使与选中数不一致。
- **Do** 破坏性操作展示具体影响范围：批量卸载对话框列出所有受影响的技能名。
- **Do** 把状态色当文字用时改用 `-text` token（`text-destructive-text`，而非 `text-destructive`）。
- **Do** 用 `1px` 边框 + 表面色差表达静态层次，用 `shadow-sm` / `shadow-lg` 只表达浮层。
- **Do** 用 `sr-only` 补充图标按钮的状态文本，而不是给无 role 的 `<span>` 加 `aria-label`。
- **Do** 在按钮禁用时用 `<span>` 包裹再挂 Tooltip，否则禁用按钮会吞掉指针事件，用户看不到原因。
- **Do** 保持所有正文与占位符文字 ≥ 4.5:1，图标 ≥ 3:1。

### Don't:
- **Don't** 用 `text-muted-foreground` 渲染彩色底上的文字（chip、彩色 Badge）——实测只有 3.5:1 左右。
- **Don't** 给静态卡片加阴影；一屏多个阴影会让界面立刻变脏。
- **Don't** 用渐变文字、玻璃拟态、`2px+` 边框、或彩色左边条。
- **Don't** 用实心红表达破坏性操作；用危险色 10% 底 + 危险色文字。
- **Don't** 把等宽字体用于非数据内容当作「技术感」装饰。
- **Don't** 谎报状态：无法判断的用「无更新源」，不要归入「已是最新」。
- **Don't** 让同一个标签指向两个不同的东西（「打开技能目录」曾同时表示「打开此技能文件夹」和「打开共享根目录」）。
- **Don't** 引入移动端断点；这是最小 `1200×800` 的桌面应用。
