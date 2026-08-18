import { lazy, Suspense, useEffect } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { CheckCircle2, FolderSync, Library, Settings, Sparkles, Store } from "lucide-react";
import { ThemeControl } from "../components/common/ThemeControl";
import { ScrollArea } from "../components/ui/scroll-area";
import { useThemeStore } from "../features/theme/store";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";

const SettingsPage = lazy(() => import("../pages/settings/SettingsPage").then(({ SettingsPage: page }) => ({ default: page })));
const SkillsPage = lazy(() => import("../pages/skills/SkillsPage").then(({ SkillsPage: page }) => ({ default: page })));
const StorePage = lazy(() => import("../pages/store/StorePage").then(({ StorePage: page }) => ({ default: page })));
const MigrationPage = lazy(() => import("../pages/migrate/MigrationPage").then(({ MigrationPage: page }) => ({ default: page })));

const navigation = [
  { icon: Library, label: "我的技能", path: "/skills" },
  { icon: Store, label: "技能商店", path: "/store" },
  { icon: FolderSync, label: "迁移存量", path: "/migrate" },
  { icon: Settings, label: "设置", path: "/settings" },
];

function ThemeSync() {
  const mode = useThemeStore((state) => state.mode);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      const isDark = mode === "dark" || (mode === "system" && mediaQuery.matches);
      document.documentElement.classList.toggle("dark", isDark);
    };

    updateTheme();
    if (mode !== "system") return;
    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, [mode]);

  return null;
}

function Navigation() {
  return (
    <nav aria-label="主导航" className="mt-10 flex flex-col gap-1">
      <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">工作区</p>
      {navigation.map(({ icon: Icon, label, path }) => (
        <NavLink
          className={({ isActive }) => cn(
            "group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
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

export function AppShell() {
  return (
    <>
      <ThemeSync />
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar p-4 text-sidebar-foreground">
          <div className="flex items-center gap-3 px-1">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">SkillSage</p>
              <p className="mt-0.5 text-xs text-muted-foreground">AI 技能管理器</p>
            </div>
          </div>

          <Navigation />

          <div className="mt-auto flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div>
                <p className="text-xs font-medium text-foreground">中央仓库已就绪</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">技能安装、迁移与分发统一管理</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs text-muted-foreground">外观</span>
              <ThemeControl />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <ScrollArea className="h-screen">
            <div className="mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-8 lg:px-12 lg:py-10">
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
