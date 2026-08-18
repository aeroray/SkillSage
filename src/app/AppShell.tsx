import { lazy, Suspense, useEffect } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Download, FolderSync, Library, Settings, Store } from "lucide-react";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { useThemeStore } from "../features/theme/store";
import { useAppUpdateStore } from "../features/update/store";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";

const SettingsPage = lazy(() => import("../pages/settings/SettingsPage").then(({ SettingsPage: page }) => ({ default: page })));
const SkillsPage = lazy(() => import("../pages/skills/SkillsPage").then(({ SkillsPage: page }) => ({ default: page })));
const StorePage = lazy(() => import("../pages/store/StorePage").then(({ StorePage: page }) => ({ default: page })));
const MigrationPage = lazy(() => import("../pages/migrate/MigrationPage").then(({ MigrationPage: page }) => ({ default: page })));

const navigation = [
  { icon: Library, label: "我的技能", path: "/skills" },
  { icon: Store, label: "技能商店", path: "/store" },
  { icon: FolderSync, label: "迁移技能", path: "/migrate" },
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
            isActive ? "bg-primary-soft text-primary" : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
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
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className="flex min-h-screen w-[228px] shrink-0 flex-col border-r border-border bg-sidebar px-5 py-6 text-sidebar-foreground">
          <div className="flex items-center gap-3 px-1">
            <img
              alt="SkillSage"
              className="size-9 shrink-0 rounded-md object-cover"
              src="/skillsage-logo.png"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">SkillSage</p>
              <p className="mt-0.5 text-xs text-muted-foreground">技能管理器</p>
            </div>
          </div>

          <Navigation ariaLabel="主导航" className="mt-12" items={navigation} />

          <div className="mt-auto flex flex-col gap-5">
            <SidebarUpdateCard />
            <Navigation ariaLabel="应用设置" items={settingsNavigation} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <ScrollArea className="h-screen">
            <div className="mx-auto w-full max-w-[1280px] px-8 py-8 lg:px-12 lg:py-10">
              <Suspense fallback={<PageLoadingState />}>
                <Routes>
                  <Route element={<StorePage />} path="/store/*" />
                  <Route element={<SkillsPage />} path="/skills" />
                  <Route element={<MigrationPage />} path="/migrate" />
                  <Route element={<SettingsPage />} path="/settings" />
                  <Route element={<Navigate replace to="/skills" />} path="*" />
                </Routes>
              </Suspense>
            </div>
          </ScrollArea>
        </main>
      </div>
    </>
  );
}
