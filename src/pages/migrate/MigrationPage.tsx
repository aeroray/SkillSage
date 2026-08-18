import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, Folder, FolderOpen, FolderSync, Link2, RefreshCw, Trash2, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog } from "../../components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageHeader } from "../../components/common/PageHeader";
import { ToolSelection, type ToolOption } from "../../components/common/ToolSelection";
import { useMigration } from "../../features/migrate";
import { openMigratePath } from "../../features/migrate/api";
import type { MigrateItem } from "../../features/migrate";
import { useDetectedTools } from "../../features/tools/hooks";
import { copyText } from "../../lib/clipboard";
import { displayPath } from "../../lib/paths";
import { normalizeTauriError } from "../../lib/tauri";

function classificationLabel(classification: string) {
  if (classification === "remote") return "已在仓库";
  if (classification === "local") return "本地技能";
  return "未知来源";
}

function classificationVariant(classification: string) {
  if (classification === "remote") return "default" as const;
  if (classification === "local") return "secondary" as const;
  return "muted" as const;
}

type MigrationItemCardProps = {
  item: MigrateItem;
  onCopyError: (message: string) => void;
  onManual: (item: MigrateItem) => void;
  onOpenPath: (path: string) => void;
  onRemove: (item: MigrateItem) => void;
  onToggle: (id: string, checked: boolean) => void;
  selected: boolean;
  tools: ToolOption[];
  working: boolean;
};

function MigrationItemCard({ item, onCopyError, onManual, onOpenPath, onRemove, onToggle, selected, tools, working }: MigrationItemCardProps) {
  const [copied, setCopied] = useState(false);
  const path = displayPath(item.displayPath || item.sourcePath);
  const isLink = item.kind.endsWith("link");
  const KindIcon = isLink ? Link2 : Folder;
  const kindLabel = isLink ? "目录链接" : "真实目录";

  const copyPath = async () => {
    try {
      await copyText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      onCopyError(normalizeTauriError(error));
    }
  };

  return (
    <Card className="border-border/80 shadow-none">
      <CardContent className="flex items-stretch gap-4 p-4">
        <div className="flex shrink-0 items-center">
          {item.canTakeover ? <Checkbox aria-label={`选择迁移 ${item.name}`} checked={selected} disabled={working} onCheckedChange={(checked) => onToggle(item.id, checked === true)} /> : <div aria-hidden="true" className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">{item.name}</p>
                <Badge variant={classificationVariant(item.classification)}>{classificationLabel(item.classification)}</Badge>
                <Badge variant="muted">{item.location === "public" ? "公共目录" : "工具目录"}</Badge>
                <Badge aria-label={kindLabel} variant="outline"><KindIcon aria-hidden="true" />{kindLabel}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.description || "暂无描述"}</p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {item.canManualHandle ? <Button disabled={working} onClick={() => onManual(item)} size="sm" variant="outline"><Wrench data-icon="inline-start" />手动处理</Button> : null}
              {item.canRemove ? <Button disabled={working} onClick={() => onRemove(item)} size="sm" variant="destructive"><Trash2 data-icon="inline-start" />删除无效链接</Button> : null}
            </div>
          </div>
          <div className="mt-3 flex w-full items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 font-mono text-xs text-muted-foreground">
              <p className="min-w-0 flex-1 break-all">{path}</p>
              <Button aria-label={copied ? "地址已复制" : "复制地址"} className="shrink-0" onClick={() => void copyPath()} size="icon" title={copied ? "地址已复制" : "复制地址"} variant="ghost">{copied ? <Check /> : <Copy />}</Button>
            </div>
            <Button aria-label="打开当前目录" disabled={working || item.canRemove} onClick={() => onOpenPath(path)} size="icon" title={item.canRemove ? "路径不可用" : "打开当前目录"} variant="outline"><FolderOpen /></Button>
          </div>
          {item.warning ? <p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />{item.warning}</p> : null}
          {item.toolIds.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{item.toolIds.map((toolId) => <Badge key={toolId} variant="outline">{tools.find((tool) => tool.id === toolId)?.name ?? toolId}</Badge>)}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function MigrationPage() {
  const navigate = useNavigate();
  const { error: toolsError, loading: toolsLoading, refresh: refreshTools, tools } = useDetectedTools();
  const { error, execute, executing, removeLink, removing, runScan, scan, scanning } = useMigration();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();
  const [manualItem, setManualItem] = useState<MigrateItem>();
  const [manualAgents, setManualAgents] = useState<string[]>([]);
  const [manualName, setManualName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<MigrateItem>();
  const [pathError, setPathError] = useState<string>();

  useEffect(() => {
    void runScan();
  }, [runScan]);

  useEffect(() => {
    const eligible = scan?.items.filter((item) => item.canTakeover) ?? [];
    setSelected(eligible.map((item) => item.id));
  }, [scan]);

  const toolOptions = useMemo<ToolOption[]>(() => tools.map((tool) => ({ detected: tool.detected, id: tool.id, name: tool.name })), [tools]);
  const eligibleCount = scan?.items.filter((item) => item.canTakeover).length ?? 0;
  const manualCount = scan?.items.filter((item) => item.canManualHandle).length ?? 0;
  const removableCount = scan?.items.filter((item) => item.canRemove).length ?? 0;
  const working = scanning || executing || removing;

  const submit = async () => {
    const result = await execute(selected.map((sourcePath) => ({ sourcePath, agents: scan?.items.find((item) => item.id === sourcePath)?.toolIds ?? [] })));
    if (!result) return;
    setMessage(`已迁移 ${result.migrated.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`);
    setSelected([]);
    await runScan();
  };

  const openPath = async (path: string) => {
    setPathError(undefined);
    try {
      await openMigratePath(path);
    } catch (error) {
      setPathError(normalizeTauriError(error));
    }
  };

  const openManual = (item: MigrateItem) => {
    setManualItem(item);
    setManualName(item.name);
    setManualAgents(item.toolIds.length > 0 ? item.toolIds : tools.filter((tool) => tool.detected).map((tool) => tool.id));
  };

  const submitManual = async () => {
    if (!manualItem) return;
    const result = await execute([{ agents: manualAgents, manual: true, sourcePath: manualItem.id, targetName: manualName.trim() || undefined }]);
    if (!result) return;
    setManualItem(undefined);
    setMessage(`已手动迁移 ${result.migrated.length} 个技能。`);
    await runScan();
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const result = await removeLink(removeTarget.id);
    if (result) setMessage(`已删除无效链接：${removeTarget.name}`);
    setRemoveTarget(undefined);
  };

  return (
    <div>
      <PageHeader
        actions={<div className="flex items-center gap-2"><Button disabled={selected.length === 0 || working || toolsLoading} onClick={() => void submit()}>{executing ? "迁移中…" : "迁移所选技能"}</Button><Button aria-label="重新扫描" disabled={working} onClick={() => void runScan()} size="icon" variant="ghost"><RefreshCw /></Button></div>}
        description="扫描工具和公共目录，把已有技能纳入中央仓库。"
        title="迁移技能"
      />
      <ErrorBanner className="mb-6" error={pathError ?? toolsError ?? error} onOpenSettings={() => navigate("/settings")} onRetry={() => { void runScan(); void refreshTools(); }} />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><FolderSync aria-hidden="true" className="size-5" /></div>
          <div className="min-w-0 flex-1"><CardTitle>扫描范围</CardTitle><CardDescription className="mt-1">仅在打开此页面时扫描。</CardDescription></div>
          <div className="flex shrink-0 items-center gap-2"><Badge variant="muted">{scan?.items.length ?? 0} 个条目</Badge><Button disabled={working} onClick={() => void runScan()} size="sm" variant="outline"><RefreshCw data-icon="inline-start" />重新扫描</Button></div>
        </CardHeader>
        <CardContent className="pb-5">
          {scanning ? <div aria-busy="true" className="flex flex-col gap-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div> : <div className="flex flex-col gap-2">{(scan?.scannedRoots ?? []).map((root) => <p className="break-all font-mono text-xs text-muted-foreground" key={root}>{displayPath(root)}</p>)}</div>}
        </CardContent>
      </Card>

      {message ? <Alert className="mb-6"><CheckCircle2 /><div><AlertTitle>迁移完成</AlertTitle><AlertDescription>{message}</AlertDescription></div></Alert> : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4"><div><CardTitle>扫描结果</CardTitle><CardDescription className="mt-1">可直接迁移 {eligibleCount} 个，需手动处理 {manualCount} 个，可删除 {removableCount} 个无效链接。</CardDescription></div><Badge variant="muted">{selected.length} 个待迁移</Badge></div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-5">
          {scanning ? <div aria-busy="true" className="flex flex-col gap-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : scan?.items.length ? scan.items.map((item) => <MigrationItemCard item={item} key={item.id} onCopyError={setPathError} onManual={openManual} onOpenPath={(path) => void openPath(path)} onRemove={setRemoveTarget} onToggle={(id, checked) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))} selected={selected.includes(item.id)} tools={toolOptions} working={working} />) : <div className="flex flex-col items-center gap-2 py-12 text-center"><FolderSync aria-hidden="true" className="size-8 text-muted-foreground" /><p className="text-sm font-medium text-foreground">没有找到待迁移技能</p><p className="text-sm text-muted-foreground">这些目录里的技能都已由 SkillSage 管理。</p></div>}
        </CardContent>
      </Card>

      <Dialog description="未知来源不会自动迁移，请确认名称和工具。" onClose={() => setManualItem(undefined)} open={Boolean(manualItem)} title="手动迁移">
        <div className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="manual-skill-name">技能名称</FieldLabel>
              <FieldDescription>使用 kebab-case，例如 my-skill。</FieldDescription>
              <Input id="manual-skill-name" onChange={(event) => setManualName(event.target.value)} value={manualName} />
            </Field>
          </FieldGroup>
          <ToolSelection agents={manualAgents} disabled={working} onToggle={(id, checked) => setManualAgents((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))} tools={toolOptions} />
          <div className="flex justify-end gap-2"><Button onClick={() => setManualItem(undefined)} variant="ghost">取消</Button><Button disabled={!manualName.trim() || manualAgents.length === 0 || working} onClick={() => void submitManual()}>{executing ? "处理中…" : "迁移并分发"}</Button></div>
        </div>
      </Dialog>

      <AlertDialog onOpenChange={(open) => !open && setRemoveTarget(undefined)} open={Boolean(removeTarget)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除无效链接？</AlertDialogTitle>
            <AlertDialogDescription>只删除无效链接，不会删除目标目录或其他技能。</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-all rounded-md bg-muted/60 p-3 font-mono text-xs text-muted-foreground">{removeTarget ? displayPath(removeTarget.displayPath || removeTarget.sourcePath) : ""}</p>
          <AlertDialogFooter><AlertDialogCancel disabled={removing}>取消</AlertDialogCancel><AlertDialogAction disabled={removing} onClick={() => void confirmRemove()} variant="destructive">{removing ? "删除中…" : "删除"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
