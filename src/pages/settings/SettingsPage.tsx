import { useEffect, useState } from "react";
import { CircleAlert, Info, Palette, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { PageHeader } from "../../components/common/PageHeader";
import { ThemeControl } from "../../components/common/ThemeControl";
import { useSettings } from "../../features/settings/hooks";

export function SettingsPage() {
  const { error, loading, save, saving, settings } = useSettings();
  const [githubToken, setGithubToken] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [saved, setSaved] = useState(false);

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

  return (
    <div>
      <PageHeader description="管理外观、GitHub 凭据和网络连接。Token 只保存在本机系统凭据管理器中。" eyebrow="03 / SETTINGS" title="设置" />
      {error ? <Alert className="mb-6" variant="destructive"><CircleAlert /><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <Card>
          <CardHeader className="flex flex-row items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></div>
            <div><CardTitle>安全与连接</CardTitle><CardDescription className="mt-1">为 GitHub 请求配置凭据和代理，配置会在重启后保留。</CardDescription></div>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-disabled={loading}>
                <FieldLabel htmlFor="github-token">GitHub Token</FieldLabel>
                <FieldDescription id="github-token-help">{settings?.githubTokenConfigured ? "当前已配置。留空保存会保留原 Token。" : "可选，用于提高 GitHub API 限额。"}</FieldDescription>
                <Input aria-describedby="github-token-help" autoComplete="off" disabled={loading || saving} id="github-token" onChange={(event) => setGithubToken(event.target.value)} placeholder={settings?.githubTokenConfigured ? "已配置，输入新 Token 可替换" : "ghp_..."} type="password" value={githubToken} />
              </Field>
              <Field data-disabled={loading}>
                <FieldLabel htmlFor="proxy-url">HTTP(S) 代理</FieldLabel>
                <FieldDescription id="proxy-url-help">例如 http://127.0.0.1:7890；留空表示不使用代理。</FieldDescription>
                <Input aria-describedby="proxy-url-help" disabled={loading || saving} id="proxy-url" onChange={(event) => setProxyUrl(event.target.value)} placeholder="http://127.0.0.1:7890" type="url" value={proxyUrl} />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-between gap-3">
            <div className="flex items-center gap-2">{settings?.githubTokenConfigured ? <Badge variant="success">Token 已配置</Badge> : <Badge variant="muted">Token 未配置</Badge>}{saved ? <span className="text-xs text-success" role="status">已保存</span> : null}</div>
            <div className="flex items-center gap-2"><Button disabled={saving || loading || !settings?.githubTokenConfigured} onClick={() => void clearToken()} variant="outline">清除 Token</Button><Button disabled={saving || loading} onClick={() => void saveSettings()}>{saving ? "保存中…" : "保存设置"}</Button></div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Palette aria-hidden="true" className="h-5 w-5" /></div>
            <div><CardTitle>外观</CardTitle><CardDescription className="mt-1">选择界面亮度，系统模式会跟随操作系统变化。</CardDescription></div>
          </CardHeader>
          <CardContent><Field orientation="horizontal"><FieldTitle>显示模式</FieldTitle><ThemeControl /></Field></CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-start gap-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Info aria-hidden="true" className="h-5 w-5" /></div><div><CardTitle>关于 SkillSage</CardTitle><CardDescription className="mt-1">桌面端 AI Agent 技能管理器，当前版本已支持三种安装来源。</CardDescription></div></CardHeader>
        <CardContent><p className="text-xs text-muted-foreground">v0.1.0 · Phase 5 settings, import & GitHub URL</p></CardContent>
      </Card>
    </div>
  );
}
