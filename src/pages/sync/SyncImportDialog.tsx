import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog } from "../../components/ui/dialog";
import { Field, FieldDescription, FieldLabel, FieldSet } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { ToolSelection, type ToolOption } from "../../components/common/ToolSelection";
import { useSyncImport } from "../../features/sync";
import type { SyncImportOptions } from "../../features/sync";

type SyncImportDialogProps = {
  onClose: () => void;
  onCompleted: () => void;
  onOpenSettings?: () => void;
  open: boolean;
  tools: ToolOption[];
};

export function SyncImportDialog({ onClose, onCompleted, onOpenSettings, open, tools }: SyncImportDialogProps) {
  const { error, importing, loading, preview, previewPath, run, setPreview } = useSyncImport();
  const [path, setPath] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [agentsBySkill, setAgentsBySkill] = useState<Record<string, string[]>>({});
  const [resultMessage, setResultMessage] = useState<string>();

  useEffect(() => {
    if (!open) {
      setPath("");
      setSelectedIds([]);
      setAgentsBySkill({});
      setResultMessage(undefined);
      setPreview(undefined);
    }
  }, [open, setPreview]);

  const selectPath = async () => {
    try {
      const selected = await openFileDialog({ directory: false, multiple: false, filters: [{ name: "JSON 清单", extensions: ["json"] }] });
      if (typeof selected === "string") {
        setPath(selected);
        void previewPath(selected);
      }
    } catch {
      // 用户取消原生选择器时保持当前状态。
    }
  };

  const inspect = () => {
    if (path.trim()) void previewPath(path);
  };

  const preparePreview = (nextPreview: typeof preview) => {
    if (!nextPreview) return;
    const available = nextPreview.skills.filter((skill) => !skill.installed);
    setSelectedIds(available.map((skill) => skill.id));
    setAgentsBySkill(Object.fromEntries(available.map((skill) => [skill.id, skill.tools.filter((tool) => tool.detected && tool.requested).map((tool) => tool.id)])));
  };

  useEffect(() => {
    preparePreview(preview);
  }, [preview]);

  const selectedCount = selectedIds.length;
  const canImport = Boolean(preview && path.trim() && selectedCount > 0 && !importing);
  const selectedOptions = useMemo<SyncImportOptions>(() => ({ selectedIds, agentsBySkill }), [agentsBySkill, selectedIds]);

  const submit = async () => {
    if (!canImport) return;
    const result = await run(path, selectedOptions);
    if (!result) return;
    setResultMessage(`已导入 ${result.imported.length} 个技能，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`);
    if (result.imported.length > 0) onCompleted();
  };

  return (
    <Dialog description="从远程技能清单恢复安装，不包含本地技能内容。" onClose={onClose} open={open} title="导入同步清单">
      <div className="flex flex-col gap-5">
        <FieldSet>
          <Field>
            <FieldLabel htmlFor="sync-package-path">清单文件</FieldLabel>
            <FieldDescription>选择其他设备导出的 JSON 文件，或粘贴完整路径。</FieldDescription>
            <div className="flex gap-2">
              <Input id="sync-package-path" onChange={(event) => setPath(event.target.value)} placeholder="C:\\Users\\...\\skillsage-sync.json" value={path} />
              <Button aria-label="选择同步清单" onClick={() => void selectPath()} size="icon" variant="outline"><FolderOpen /></Button>
              <Button disabled={!path.trim() || loading} onClick={inspect} variant="secondary">{loading ? "解析中…" : "解析"}</Button>
            </div>
          </Field>
        </FieldSet>

        <ErrorBanner error={error} onOpenSettings={onOpenSettings} />
        {loading ? <div aria-busy="true" className="flex flex-col gap-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-20" /></div> : null}
        {resultMessage ? <Alert><Upload /><AlertDescription>{resultMessage}</AlertDescription></Alert> : null}

        {preview ? <>
          <Card>
            <CardHeader><CardTitle className="text-base">清单预览</CardTitle><CardDescription>{preview.path} · 导出时间 {preview.exportedAt}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {preview.skills.map((skill) => {
                const selected = selectedIds.includes(skill.id);
                return <div className="flex flex-col gap-3 rounded-md border border-border p-3" key={skill.id}>
                  <div className="flex items-start gap-3">
                    <Checkbox aria-label={`选择 ${skill.name}`} checked={selected} disabled={skill.installed} onCheckedChange={(checked) => setSelectedIds((current) => checked === true ? [...new Set([...current, skill.id])] : current.filter((id) => id !== skill.id))} />
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-foreground">{skill.name}</p><Badge variant="muted">{skill.currentVersion.slice(0, 10)}</Badge>{skill.installed ? <Badge variant="secondary">已存在</Badge> : null}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{skill.description || "暂无描述"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{skill.source}</p></div>
                  </div>
                  {selected ? <ToolSelection agents={agentsBySkill[skill.id] ?? []} disabled={importing} onToggle={(id, checked) => setAgentsBySkill((current) => ({ ...current, [skill.id]: checked ? [...new Set([...(current[skill.id] ?? []), id])] : (current[skill.id] ?? []).filter((agent) => agent !== id) }))} tools={tools} /> : null}
                </div>;
              })}
            </CardContent>
          </Card>
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">已选择 {selectedCount} 个技能</p><Button disabled={!canImport} onClick={() => void submit()}>{importing ? "导入中…" : "确认导入"}</Button></div>
        </> : null}
      </div>
    </Dialog>
  );
}
