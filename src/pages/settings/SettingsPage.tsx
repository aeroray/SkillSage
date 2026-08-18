import { useEffect, useState } from "react";
import { Download, Info, Palette, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { AccentControl } from "../../components/common/AccentControl";
import { PageHeader } from "../../components/common/PageHeader";
import { ThemeControl } from "../../components/common/ThemeControl";
import { useAppCleanup } from "../../features/cleanup";
import { useSettings } from "../../features/settings/hooks";
import { CleanupDialog } from "./CleanupDialog";
import { SyncImportDialog } from "../sync/SyncImportDialog";
import { useSyncExport, type SyncSettings } from "../../features/sync";
import { useThemeStore } from "../../features/theme/store";
import { useDetectedTools } from "../../features/tools/hooks";
import { displayPath } from "../../lib/paths";
import { isBrowserPreview } from "../../lib/tauri";

export function SettingsPage() {
  const { error, loading, refresh, save, saving, settings } = useSettings();
  const cleanup = useAppCleanup();
  const { tools } = useDetectedTools();
  const [githubToken, setGithubToken] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const syncExport = useSyncExport();
  const themeMode = useThemeStore((state) => state.mode);
  const themeAccent = useThemeStore((state) => state.accent);
  const setThemeMode = useThemeStore((state) => state.setMode);
  const setThemeAccent = useThemeStore((state) => state.setAccent);

  useEffect(() => {
    if (settings) setProxyUrl(settings.proxyUrl ?? "");
  }, [settings]);

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
    const result = await save({ clearGithubToken: true, proxyUrl: proxyUrl.trim() || undefined });
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
    <div>
      <PageHeader description="管理外观、GitHub 凭据、网络和应用数据。Token 仅保存在本机。" title="设置" />
      <ErrorBanner className="mb-6" error={error} onRetry={() => void refresh()} />

      <div className="grid gap-6 lg:items-start lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <Card>
          <CardHeader className="flex flex-row items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></div>
            <div><CardTitle>安全与连接</CardTitle><CardDescription className="mt-1">配置 GitHub 凭据和代理，设置会保留在本机。</CardDescription></div>
          </CardHeader>
          <CardContent>
            {loading ? <div aria-busy="true" aria-label="正在加载设置" className="flex flex-col gap-4"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : <FieldGroup>
              <Field data-disabled={loading}>
                <FieldLabel htmlFor="github-token">GitHub Token</FieldLabel>
                <FieldDescription id="github-token-help">{settings?.githubTokenConfigured ? "已配置，留空即可保留。" : "可选，用于提高 GitHub API 限额。"}</FieldDescription>
                <Input aria-describedby="github-token-help" autoComplete="off" disabled={loading || saving} id="github-token" onChange={(event) => setGithubToken(event.target.value)} placeholder={settings?.githubTokenConfigured ? "已配置，输入新 Token 可替换" : "ghp_..."} type="password" value={githubToken} />
              </Field>
              <Field data-disabled={loading}>
                <FieldLabel htmlFor="proxy-url">HTTP(S) 代理</FieldLabel>
                <FieldDescription id="proxy-url-help">例如 http://127.0.0.1:7890。留空则不使用代理。</FieldDescription>
                <Input aria-describedby="proxy-url-help" disabled={loading || saving} id="proxy-url" onChange={(event) => setProxyUrl(event.target.value)} placeholder="http://127.0.0.1:7890" type="url" value={proxyUrl} />
              </Field>
            </FieldGroup>}
          </CardContent>
          <CardFooter className="justify-between gap-3 pt-5">
            <div className="flex min-h-9 items-center gap-2">{settings?.githubTokenConfigured ? <Badge variant="success">已配置</Badge> : <Badge variant="muted">未配置</Badge>}{saved ? <span className="text-xs text-success" role="status">已保存</span> : null}</div>
            <div className="flex items-center gap-2"><Button disabled={saving || loading || !settings?.githubTokenConfigured} onClick={() => void clearToken()} variant="outline">清除 Token</Button><Button disabled={saving || loading} onClick={() => void saveSettings()}>{saving ? "保存中…" : "保存"}</Button></div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Palette aria-hidden="true" className="h-5 w-5" /></div>
            <div><CardTitle>外观</CardTitle><CardDescription className="mt-1">调整显示模式和主题色。</CardDescription></div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 pb-5">
            <Field className="justify-between gap-4" orientation="horizontal"><FieldTitle>显示模式</FieldTitle><ThemeControl /></Field>
            <Field className="justify-between gap-4" orientation="horizontal"><FieldTitle>主题色</FieldTitle><AccentControl /></Field>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Info aria-hidden="true" className="h-5 w-5" /></div><div><CardTitle>关于与更新</CardTitle><CardDescription className="mt-1">SkillSage 技能管理器与版本信息。</CardDescription></div></div>
          <Badge className="shrink-0" variant="muted">v0.1.0</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 pb-5 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">支持来源</p><p className="mt-1 text-sm font-medium text-foreground">商店、本地、GitHub</p></div>
          <div className="rounded-md border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">项目资源</p><p className="mt-1 text-sm font-medium text-foreground">GitHub 项目与产品主页</p></div>
          <div className="rounded-md border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">版本更新</p><p className="mt-1 text-sm font-medium text-foreground">检查更新入口</p></div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><RefreshCw aria-hidden="true" className="h-5 w-5" /></div>
          <div><CardTitle>设备同步</CardTitle><CardDescription className="mt-1">在设备间迁移技能和应用设置。</CardDescription></div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-5">
          <div className="flex items-center justify-between gap-5 rounded-lg border border-border bg-muted/30 p-4">
            <div className="min-w-0"><p className="text-sm font-medium text-foreground">同步数据</p><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">包含远程技能记录、分发目标、显示模式、主题色和代理设置。GitHub Token 不会导出。</p></div>
            <div className="flex shrink-0 items-center gap-2"><Button onClick={() => setSyncOpen(true)} variant="outline"><Upload data-icon="inline-start" />导入同步数据</Button><Button disabled={loading || syncExport.exporting || !settings} onClick={() => void exportSyncData()}><Download data-icon="inline-start" />{syncExport.exporting ? "导出中…" : "导出同步数据"}</Button></div>
          </div>
          {syncExport.error ? <ErrorBanner error={syncExport.error} /> : null}
          {syncExport.path ? <Alert><Download /><AlertDescription>同步数据已导出到：{displayPath(syncExport.path)}</AlertDescription></Alert> : null}
        </CardContent>
      </Card>

      <Card className="mt-6 border-destructive/30">
        <CardHeader className="flex flex-row items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive"><Trash2 aria-hidden="true" className="h-5 w-5" /></div>
          <div><CardTitle>卸载 SkillSage</CardTitle><CardDescription className="mt-1">卸载前选择如何处理技能和分发链接。</CardDescription></div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-5">
          {cleanup.error ? <ErrorBanner error={cleanup.error} /> : null}
          {cleanup.result ? <Alert><Trash2 /><AlertDescription>{cleanup.result.centralRemoved ? "已删除仓库、分发链接和管理数据。" : "已保留技能和现有链接，删除管理数据。"}</AlertDescription></Alert> : null}
          <div className="flex items-center justify-between gap-5 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">选择卸载方式</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">可以保留技能文件和现有链接，也可以删除技能仓库、分发链接和管理数据。</p>
            </div>
            <Button className="shrink-0" onClick={() => setCleanupOpen(true)} variant="destructive">选择方式</Button>
          </div>
        </CardContent>
      </Card>

      <CleanupDialog cleaning={cleanup.cleaning} onClose={() => setCleanupOpen(false)} onConfirm={(mode) => { void cleanup.run(mode); setCleanupOpen(false); }} open={cleanupOpen} />
      <SyncImportDialog onApplySettings={applyImportedSettings} onClose={() => setSyncOpen(false)} onCompleted={() => { void refresh(); }} open={syncOpen} tools={tools} />
    </div>
  );
}
