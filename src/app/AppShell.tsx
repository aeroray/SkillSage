import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  Check,
  Copy,
  Download,
  FolderInput,
  FolderOpen,
  Library,
  Settings,
  Store,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { openSkillsRoot } from "../features/skills/api";
import { useInstalledSkills } from "../features/skills/hooks";
import { useThemeStore } from "../features/theme/store";
import { useAppUpdateStore } from "../features/update/store";
import { copyText } from "../lib/clipboard";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";

const SettingsPage = lazy(() => import("../pages/settings/SettingsPage").then(({ SettingsPage: page }) => ({ default: page })));
const SkillsPage = lazy(() => import("../pages/skills/SkillsPage").then(({ SkillsPage: page }) => ({ default: page })));
const StorePage = lazy(() => import("../pages/store/StorePage").then(({ StorePage: page }) => ({ default: page })));
const AdoptPage = lazy(() => import("../pages/adopt/AdoptPage").then(({ AdoptPage: page }) => ({ default: page })));

const navigation = [
  { icon: Library, label: "我的技能", path: "/skills" },
  { icon: Store, label: "技能商店", path: "/store" },
  { icon: FolderInput, label: "采纳技能", path: "/adopt" },
];

const settingsNavigation = [{ icon: Settings, label: "设置", path: "/settings" }];

function ThemeSync() {
  const accent = useThemeStore((state) => state.accent);
  const mode = useThemeStore((state) => state.mode);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      const isDark = mode === "dark" || (mode === "system" && mediaQuery.matches);
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.dataset.accent = accent;
    };

    updateTheme();
    if (mode !== "system") return;
    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, [accent, mode]);

  return null;
}

function Navigation({ ariaLabel, className, items }: { ariaLabel: string; className?: string; items: typeof navigation }) {
  return (
    <nav aria-label={ariaLabel} className={cn("flex flex-col gap-1", className)}>
      {items.map(({ icon: Icon, label, path }) => (
        <NavLink
          className={({ isActive }) => cn(
            "group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            isActive ? "bg-primary-soft text-primary-text" : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
          )}
          key={path}
          to={path}
        >
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function PageLoadingState() {
  return <div aria-busy="true" aria-label="正在加载页面" className="flex flex-col gap-6"><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-96" /><Skeleton className="h-48 w-full" /></div>;
}

/**
 * The shared directory is the product's central fact: every skill lives here
 * and every AI tool reads it. The sidebar is the natural home for it, which
 * also gives the previously empty rail a job.
 */
function SidebarWorkspace() {
  const { loading, skills, skillsRoot } = useInstalledSkills();
  const [copied, setCopied] = useState(false);

  const claudeCount = skills.filter((skill) => skill.claudeDistributed).length;
  const workbuddyCount = skills.filter((skill) => skill.workbuddyDistributed).length;

  const copyPath = async () => {
    if (!skillsRoot) return;
    try {
      await copyText(skillsRoot);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the path stays selectable either way.
    }
  };

  const stats = [
    { label: "已安装", value: skills.length },
    { label: "Claude Code", value: claudeCount },
    { label: "Work Buddy", value: workbuddyCount },
  ];

  return (
    <section
      aria-label="共享技能目录"
      className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-foreground">共享技能目录</h2>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="复制共享目录路径"
                disabled={!skillsRoot}
                onClick={() => void copyPath()}
                size="icon"
                variant="ghost"
              >
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>
              {copied ? "已复制路径" : "复制路径"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="打开共享目录"
                disabled={!skillsRoot}
                onClick={() => void openSharedDirectory(skillsRoot)}
                size="icon"
                variant="ghost"
              >
                <FolderOpen aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>在文件管理器中打开</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <p
        className="truncate font-mono text-xs leading-4 text-muted-foreground"
        title={skillsRoot ?? undefined}
      >
        {skillsRoot ?? "加载中…"}
      </p>

      <dl className="flex flex-col gap-1.5 border-t border-border pt-3">
        {stats.map(({ label, value }) => (
          <div className="flex items-baseline justify-between gap-2" key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xs font-medium tabular-nums text-foreground">
              {loading ? "—" : value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Opens the shared root through the same Rust command the page toolbar uses. */
async function openSharedDirectory(path: string | undefined) {
  if (!path) return;
  try {
    await openSkillsRoot(path);
  } catch {
    // A failed open is non-fatal here; the skills page surfaces it in full.
  }
}

function SidebarUpdateCard() {
  const available = useAppUpdateStore((state) => state.available);
  const error = useAppUpdateStore((state) => state.error);
  const install = useAppUpdateStore((state) => state.install);
  const phase = useAppUpdateStore((state) => state.phase);
  const progress = useAppUpdateStore((state) => state.progress);
  const busy = phase === "downloading" || phase === "installing";

  if (!available) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary-soft/50 p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Download aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">发现应用更新</p>
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            {busy ? `${phase === "installing" ? "正在安装" : "正在下载"}${progress === null ? "…" : ` ${progress}%`}` : error ? "安装失败，请重试" : `v${available.version} 可用`}
          </p>
        </div>
      </div>
      <Button className="w-full" disabled={busy} onClick={() => void install()} size="sm">
        {busy ? (phase === "installing" ? "正在安装…" : "正在下载…") : phase === "error" ? "重试安装" : "立即安装"}
      </Button>
    </div>
  );
}

export function AppShell() {
  const checkOnStartup = useAppUpdateStore((state) => state.checkOnStartup);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkOnStartup(), 1200);
    return () => window.clearTimeout(timer);
  }, [checkOnStartup]);

  return (
    <>
      <ThemeSync />
      {/* The shell fills the viewport and never scrolls itself. Pages are
          flex columns that fill this height and put scrolling on their own
          list region, so a long list cannot push the page chrome off-screen
          or introduce a second scrollbar. */}
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <aside className="flex h-full w-[228px] shrink-0 flex-col border-r border-border bg-sidebar px-4 py-5 text-sidebar-foreground">
          <div className="flex items-center gap-3 px-2">
            <img
              alt="SkillSage · 技匠"
              className="size-9 shrink-0 rounded-md object-cover"
              src="/skillsage-logo.png"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">SkillSage</p>
              <p className="mt-0.5 text-xs text-muted-foreground">技匠</p>
            </div>
          </div>

          <Navigation ariaLabel="主导航" className="mt-6" items={navigation} />

          <SidebarWorkspace />

          <div className="mt-auto flex flex-col gap-4 pt-6">
            <SidebarUpdateCard />
            <Navigation ariaLabel="应用设置" items={settingsNavigation} />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden px-8 py-8 lg:px-10 lg:py-9">
            <Suspense fallback={<PageLoadingState />}>
              <Routes>
                <Route element={<StorePage />} path="/store/*" />
                <Route element={<SkillsPage />} path="/skills" />
                <Route element={<AdoptPage />} path="/adopt" />
                <Route element={<SettingsPage />} path="/settings" />
                <Route element={<Navigate replace to="/skills" />} path="*" />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </>
  );
}
