import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { CheckCircle2, Library, Settings, Sparkles, Store } from "lucide-react";
import { ThemeControl } from "../components/common/ThemeControl";
import { ScrollArea } from "../components/ui/scroll-area";
import { useThemeStore } from "../features/theme/store";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { SkillsPage } from "../pages/skills/SkillsPage";
import { StorePage } from "../pages/store/StorePage";

const navigation = [
  { icon: Store, label: "技能商店", path: "/store" },
  { icon: Library, label: "我的技能", path: "/skills" },
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
    if (mode !== "system") {
      return;
    }

    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, [mode]);

  return null;
}

function Navigation() {
  return (
    <nav aria-label="主导航" className="mt-10 space-y-1">
      <p className="eyebrow mb-3 px-3 max-md:hidden">Workspace</p>
      {navigation.map(({ icon: Icon, label, path }) => (
        <NavLink
          className={({ isActive }) =>
            `group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all duration-150 ease-out max-md:justify-center max-md:px-0 ${
              isActive
                ? "bg-primary-soft text-primary"
                : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
            }`
          }
          key={path}
          to={path}
        >
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="max-md:hidden">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  return (
    <>
      <ThemeSync />
      <div className="app-shell flex bg-background text-foreground">
        <aside className="app-sidebar flex w-20 shrink-0 flex-col border-r border-border bg-sidebar p-2 text-sidebar-foreground md:w-64 md:p-4">
          <div className="flex items-center gap-3 px-2 md:px-1">
            <div className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </div>
            <div className="min-w-0 max-md:hidden">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">SkillSage</p>
              <p className="mt-0.5 text-xs text-muted-foreground">AI 技能管理器</p>
            </div>
          </div>

          <Navigation />

          <div className="mt-auto space-y-4">
            <div className="surface-card hidden items-start gap-3 p-3 md:flex">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div>
                <p className="text-xs font-medium text-foreground">基础层已就绪</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Phase 1 · foundation</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-1 max-md:justify-center">
              <span className="text-xs text-muted-foreground max-md:hidden">外观</span>
              <ThemeControl />
            </div>
          </div>
        </aside>

        <main className="app-main">
          <ScrollArea className="app-scroll-area">
            <div className="app-content">
              <Routes>
                <Route element={<StorePage />} path="/store" />
                <Route element={<StorePage />} path="/store/:skillId" />
                <Route element={<SkillsPage />} path="/skills" />
                <Route element={<SettingsPage />} path="/settings" />
                <Route element={<Navigate replace to="/store" />} path="*" />
              </Routes>
            </div>
          </ScrollArea>
        </main>
      </div>
    </>
  );
}
