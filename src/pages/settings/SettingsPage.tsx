import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  Download,
  ExternalLink,
  GitFork,
  Globe2,
  Info,
  Palette,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wrench,
} from "lucide-react";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { AccentControl } from "../../components/common/AccentControl";
import { ThemeControl } from "../../components/common/ThemeControl";
import { useSettings } from "../../features/settings/hooks";
import { ToolSettingsCard } from "../../features/tools/ToolSettingsCard";
import { SyncImportDialog } from "../sync/SyncImportDialog";
import { useSyncExport, type SyncSettings } from "../../features/sync";
import { useThemeStore } from "../../features/theme/store";
import { useAppUpdateStore } from "../../features/update/store";
import { displayPath } from "../../lib/paths";
import { isBrowserPreview } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import packageJson from "../../../package.json";

const GITHUB_PROJECT_URL = "https://github.com/aeroray/SkillSage";
const PRODUCT_HOME_URL = "https://aeroray.github.io/SkillSage/";

function formatLastChecked(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * Settings is grouped into sections rather than laid out as two columns of
 * cards. The two-column version had no reading order — 外观 sat under 设备同步
 * purely because the left column ran out of room — so finding a setting meant
 * scanning both columns every time. One section at a time means the nav itself
 * answers "where is it", and each section can be as long as it needs without
 * pushing a neighbour around.
 */
const SECTIONS = [
  { id: "appearance", icon: Palette, label: "外观" },
  { id: "connection", icon: ShieldCheck, label: "安全与连接" },
  { id: "tools", icon: Wrench, label: "AI 工具与分发" },
  { id: "sync", icon: RefreshCw, label: "设备同步" },
  { id: "about", icon: Info, label: "关于与更新" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsPage() {
  const { error, loading, refresh, save, saving, settings } = useSettings();
  const [githubToken, setGithubToken] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [appVersion, setAppVersion] = useState(packageJson.version);
  const [syncOpen, setSyncOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("appearance");
  const syncExport = useSyncExport();
  const themeMode = useThemeStore((state) => state.mode);
  const themeAccent = useThemeStore((state) => state.accent);
  const setThemeMode = useThemeStore((state) => state.setMode);
  const setThemeAccent = useThemeStore((state) => state.setAccent);
  const appUpdate = useAppUpdateStore((state) => state.available);
  const appUpdateChecking = useAppUpdateStore((state) => state.checking);
  const appUpdateError = useAppUpdateStore((state) => state.error);
  const appUpdateInstall = useAppUpdateStore((state) => state.install);
  const appUpdatePhase = useAppUpdateStore((state) => state.phase);
  const appUpdateProgress = useAppUpdateStore((state) => state.progress);
  const appUpdateLastCheckedAt = useAppUpdateStore(
    (state) => state.lastCheckedAt,
  );
  const checkAppUpdate = useAppUpdateStore((state) => state.check);
  const appUpdateSource = useAppUpdateStore((state) => state.source);
  const lastCheckedLabel = formatLastChecked(appUpdateLastCheckedAt);
  const appUpdateBusy =
    appUpdatePhase === "downloading" || appUpdatePhase === "installing";

  useEffect(() => {
    if (settings) setProxyUrl(settings.proxyUrl ?? "");
  }, [settings]);

  // The app version is fixed for the process lifetime, so read it once rather
  // than on every settings change.
  useEffect(() => {
    if (!isBrowserPreview())
      void getVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  const saveSettings = async () => {
    setSaved(false);
    const result = await save({
      githubToken: githubToken.trim() || undefined,
      proxyUrl: proxyUrl.trim() || undefined,
    });
    if (result) {
      setGithubToken("");
      setSaved(true);
    }
  };

  const clearToken = async () => {
    setSaved(false);
    const result = await save({
      clearGithubToken: true,
      proxyUrl: proxyUrl.trim() || undefined,
    });
    if (result) setSaved(true);
  };

  const exportSyncData = async () => {
    const destination = isBrowserPreview()
      ? "C:\\Users\\PC\\Desktop\\SkillSage-sync.json"
      : await saveFileDialog({
          defaultPath: "SkillSage-sync.json",
          filters: [{ extensions: ["json"], name: "SkillSage 同步数据" }],
        });
    if (typeof destination !== "string") return;
    await syncExport.run(destination, {
      proxyUrl: settings?.proxyUrl || undefined,
      themeAccent,
      themeMode,
    });
  };

  const applyImportedSettings = async (next: SyncSettings) => {
    setThemeMode(next.themeMode);
    setThemeAccent(next.themeAccent);
    await save({ proxyUrl: next.proxyUrl || undefined });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ErrorBanner className="mb-4" error={error} onRetry={() => void refresh()} />

      {/* Nav on the left, one section on the right. Only the section pane
          scrolls, so the nav stays put and the page never grows a scrollbar. */}
      <div className="flex min-h-0 flex-1 gap-6">
        <nav aria-label="设置分区" className="flex w-44 shrink-0 flex-col gap-1">
          {SECTIONS.map(({ id, icon: Icon, label }) => {
            const active = section === id;
            return (
              <button
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  active
                    ? "bg-primary-soft text-primary-text"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                key={id}
                onClick={() => setSection(id)}
                type="button"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 pb-1">
            {section === "appearance" ? (
              <Card>
                <CardHeader className="flex flex-row items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <Palette aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>外观</CardTitle>
                    <CardDescription className="mt-1">
                      调整显示模式和主题色，设置会立即生效。
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-5 pb-5">
                  <Field className="justify-between gap-4" orientation="horizontal">
                    <FieldTitle>显示模式</FieldTitle>
                    <ThemeControl />
                  </Field>
                  <Field className="justify-between gap-4" orientation="horizontal">
                    <FieldTitle>主题色</FieldTitle>
                    <AccentControl />
                  </Field>
                </CardContent>
              </Card>
            ) : null}

            {section === "connection" ? (
              <Card>
                <CardHeader className="flex flex-row items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>安全与连接</CardTitle>
                    <CardDescription className="mt-1">
                      配置 GitHub 凭据和代理，设置会保留在本机。
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div
                      aria-busy="true"
                      aria-label="正在加载设置"
                      className="flex flex-col gap-4"
                    >
                      <Skeleton className="h-16" />
                      <Skeleton className="h-16" />
                    </div>
                  ) : (
                    <FieldGroup>
                      <Field data-disabled={loading}>
                        <FieldLabel htmlFor="github-token">GitHub Token</FieldLabel>
                        <FieldDescription id="github-token-help">
                          {settings?.githubTokenConfigured
                            ? "已配置，留空即可保留。"
                            : "可选，用于提高 GitHub API 限额。"}
                        </FieldDescription>
                        <Input
                          aria-describedby="github-token-help"
                          autoComplete="off"
                          disabled={loading || saving}
                          id="github-token"
                          onChange={(event) => setGithubToken(event.target.value)}
                          placeholder={
                            settings?.githubTokenConfigured
                              ? "已配置，输入新 Token 可替换"
                              : "ghp_..."
                          }
                          type="password"
                          value={githubToken}
                        />
                      </Field>
                      <Field data-disabled={loading}>
                        <FieldLabel htmlFor="proxy-url">HTTP(S) 代理</FieldLabel>
                        <FieldDescription id="proxy-url-help">
                          例如 http://127.0.0.1:7890。留空则不使用代理。
                        </FieldDescription>
                        <Input
                          aria-describedby="proxy-url-help"
                          disabled={loading || saving}
                          id="proxy-url"
                          onChange={(event) => setProxyUrl(event.target.value)}
                          placeholder="http://127.0.0.1:7890"
                          type="url"
                          value={proxyUrl}
                        />
                      </Field>
                    </FieldGroup>
                  )}
                </CardContent>
                <CardFooter className="justify-between gap-3 pt-5">
                  <div className="flex min-h-9 items-center gap-2">
                    {settings?.githubTokenConfigured ? (
                      <Badge variant="success">已配置</Badge>
                    ) : (
                      <Badge variant="muted">未配置</Badge>
                    )}
                    {saved ? (
                      <span className="text-xs text-success-text" role="status">
                        已保存
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={saving || loading || !settings?.githubTokenConfigured}
                      onClick={() => void clearToken()}
                      variant="outline"
                    >
                      清除 Token
                    </Button>
                    <Button disabled={saving || loading} onClick={() => void saveSettings()}>
                      {saving ? "保存中…" : "保存"}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ) : null}

            {section === "tools" ? <ToolSettingsCard /> : null}

            {section === "sync" ? (
              <Card>
                <CardHeader className="flex flex-row items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <RefreshCw aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>设备同步</CardTitle>
                    <CardDescription className="mt-1">
                      在设备间迁移技能和应用设置。
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pb-5">
                  <div className="flex items-start justify-between gap-5 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">同步数据</p>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                        包含远程技能记录、技能说明译文、显示模式、主题色和代理设置。GitHub
                        Token 不会导出。
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2">
                      <Button onClick={() => setSyncOpen(true)} variant="outline">
                        <Upload data-icon="inline-start" />
                        导入同步数据
                      </Button>
                      <Button
                        disabled={loading || syncExport.exporting || !settings}
                        onClick={() => void exportSyncData()}
                      >
                        <Download data-icon="inline-start" />
                        {syncExport.exporting ? "导出中…" : "导出同步数据"}
                      </Button>
                    </div>
                  </div>
                  {syncExport.error ? <ErrorBanner error={syncExport.error} /> : null}
                  {syncExport.path ? (
                    <Alert>
                      <Download />
                      <AlertDescription>
                        同步数据已导出到：{displayPath(syncExport.path)}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {section === "about" ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Info aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>关于与更新</CardTitle>
                      <CardDescription className="mt-1">
                        技匠（SkillSage）技能管理器与版本信息。
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className="shrink-0" variant="muted">
                    v{appVersion}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pb-5">
                  <div className="rounded-md border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">项目资源</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      GitHub 项目与产品主页
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={GITHUB_PROJECT_URL} rel="noreferrer" target="_blank">
                          <GitFork data-icon="inline-start" />
                          GitHub 项目
                          <ExternalLink data-icon="inline-end" />
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a href={PRODUCT_HOME_URL} rel="noreferrer" target="_blank">
                          <Globe2 data-icon="inline-start" />
                          产品主页
                          <ExternalLink data-icon="inline-end" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">应用更新</p>
                        <p
                          aria-live="polite"
                          className="mt-1 text-sm font-medium text-foreground"
                        >
                          {appUpdateChecking
                            ? "正在检查更新"
                            : appUpdate
                              ? `发现新版本 v${appUpdate.version}`
                              : appUpdateError
                                ? "检查失败"
                                : lastCheckedLabel
                                  ? "已是最新版本"
                                  : "尚未检查"}
                        </p>
                      </div>
                      {appUpdate ? <Badge variant="success">可更新</Badge> : null}
                    </div>
                    <p className="mt-2 min-h-4 text-xs text-muted-foreground">
                      {lastCheckedLabel
                        ? `上次检查：${lastCheckedLabel}`
                        : "启动后会自动检查一次"}
                      {/* Naming the source makes a slow or failing mirror
                          diagnosable instead of invisible. */}
                      {appUpdateSource
                        ? ` · 通过 ${appUpdateSource === "direct" ? "GitHub 直连" : appUpdateSource}`
                        : ""}
                    </p>
                    {appUpdateError ? (
                      <p className="mt-1 line-clamp-2 text-xs text-destructive-text">
                        检查失败：{appUpdateError}
                      </p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <Button
                        disabled={appUpdateChecking || appUpdateBusy || isBrowserPreview()}
                        onClick={() => {
                          void checkAppUpdate().catch(() => undefined);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {appUpdateChecking ? "检查中…" : "检查更新"}
                      </Button>
                      {appUpdate ? (
                        <Button
                          disabled={appUpdateBusy || isBrowserPreview()}
                          onClick={() => void appUpdateInstall()}
                          size="sm"
                        >
                          {appUpdatePhase === "downloading"
                            ? `下载中${appUpdateProgress === null ? "…" : ` ${appUpdateProgress}%`}`
                            : appUpdatePhase === "installing"
                              ? "安装中…"
                              : appUpdatePhase === "error"
                                ? "重试安装"
                                : "立即安装"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </ScrollArea>
      </div>

      <SyncImportDialog
        onApplySettings={applyImportedSettings}
        onClose={() => setSyncOpen(false)}
        onCompleted={() => {
          void refresh();
        }}
        open={syncOpen}
      />
    </div>
  );
}
