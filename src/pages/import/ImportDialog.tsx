import { useCallback, useEffect, useRef, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { CircleAlert, FolderOpen, SearchCheck } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { ToolSelection, type ToolOption } from "../../components/common/ToolSelection";
import { useImport } from "../../features/import/hooks";
import { useDistributionConflicts } from "../../features/skills/hooks";
import type { DistributionConflict } from "../../features/skills/types";

type ImportDialogProps = {
  onClose: () => void;
  onCompleted: () => void;
  open: boolean;
  tools: ToolOption[];
};

export function ImportDialog({ onClose, onCompleted, open, tools }: ImportDialogProps) {
  const [path, setPath] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [conflict, setConflict] = useState("reject");
  const [renameTo, setRenameTo] = useState("");
  const [distributionConflicts, setDistributionConflicts] = useState<DistributionConflict[]>();
  const initializedAgents = useRef(false);
  const handleCompleted = useCallback(() => {
    onCompleted();
    onClose();
  }, [onClose, onCompleted]);
  const { error, importing, loading, preview, previewPath, reset, runImport } = useImport(handleCompleted);
  const conflictCheck = useDistributionConflicts();

  useEffect(() => {
    if (open && !initializedAgents.current && tools.length > 0) {
      setAgents(tools.filter((tool) => tool.detected).map((tool) => tool.id));
      initializedAgents.current = true;
    }
    if (!open) {
      setPath("");
      setAgents([]);
      setConflict("reject");
      setRenameTo("");
      setDistributionConflicts(undefined);
      initializedAgents.current = false;
      reset();
    }
  }, [open, reset, tools]);

  const choosePath = async (directory: boolean) => {
    try {
      const selected = await openFileDialog({
        directory,
        multiple: false,
        title: directory ? "选择技能目录" : "选择 SKILL.md",
        ...(directory ? {} : { filters: [{ name: "SKILL.md", extensions: ["md"] }] }),
      });
      if (typeof selected === "string") {
        setPath(selected);
        await previewPath(selected);
      }
    } catch {
      // Browser preview and cancelled native dialogs both leave the current path unchanged.
    }
  };

  const canImport = Boolean(preview) && !preview?.remoteConflict && agents.length > 0 && (!preview?.existingLocal || conflict !== "reject") && (conflict !== "rename" || renameTo.trim().length > 0);
  const startImport = async () => {
    if (!preview) return;
    const conflicts = await conflictCheck.check(preview.name, agents);
    if (conflicts.length > 0) {
      setDistributionConflicts(conflicts);
      return;
    }
    await runImport(path, agents, conflict, renameTo);
  };
  const importSkippingConflicts = async () => {
    if (!preview || !distributionConflicts) return;
    const blocked = new Set(distributionConflicts.map((item) => item.toolId));
    setDistributionConflicts(undefined);
    await runImport(path, agents.filter((agent) => !blocked.has(agent)), conflict, renameTo);
  };
  const importTakingOverConflicts = async () => {
    if (!preview || !distributionConflicts) return;
    const actions = Object.fromEntries(distributionConflicts.map((item) => [item.toolId, "takeover" as const]));
    setDistributionConflicts(undefined);
    await runImport(path, agents, conflict, renameTo, actions);
  };

  return (
    <>
      <Dialog description="支持选择技能目录，或直接选择其中的 SKILL.md 文件。" onClose={onClose} open={open} title="导入本地技能">
      <div className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="import-path">来源路径</FieldLabel>
            <FieldDescription id="import-path-help">导入前会校验 frontmatter，并拒绝符号链接内容。</FieldDescription>
            <div className="flex items-center gap-2">
              <Input aria-describedby="import-path-help" id="import-path" onChange={(event) => { setPath(event.target.value); reset(); }} placeholder="选择目录或 SKILL.md" value={path} />
              <Button aria-label="选择技能目录" onClick={() => void choosePath(true)} size="icon" variant="outline"><FolderOpen /></Button>
              <Button aria-label="选择 SKILL.md 文件" onClick={() => void choosePath(false)} size="icon" variant="outline"><SearchCheck /></Button>
            </div>
          </Field>
          <Button className="self-start" disabled={!path.trim() || loading || importing} onClick={() => void previewPath(path)} variant="secondary">{loading ? "解析中…" : "解析预览"}</Button>
        </FieldGroup>

        <ErrorBanner error={error} />
        {loading ? <div aria-busy="true" className="flex flex-col gap-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-20" /></div> : null}
        {preview ? <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-foreground">{preview.name}</h3><Badge variant="muted">{preview.sourceKind === "file" ? "单文件" : "目录"}</Badge></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{preview.description}</p></div><Badge variant="success">{preview.fileCount} 个文件</Badge></div>
          {preview.remoteConflict ? <Alert variant="destructive"><CircleAlert /><AlertDescription>同名远程技能已存在，不能覆盖远程仓库内容。</AlertDescription></Alert> : null}
          {preview.existingLocal ? <Field><FieldLabel htmlFor="import-conflict">同名本地技能处理</FieldLabel><Select onValueChange={setConflict} value={conflict}><SelectTrigger id="import-conflict"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="reject">保留现有技能</SelectItem><SelectItem value="overwrite">覆盖现有技能</SelectItem><SelectItem value="rename">导入为新名称</SelectItem></SelectGroup></SelectContent></Select>{conflict === "rename" ? <Input aria-label="新的技能名称" className="mt-2" onChange={(event) => setRenameTo(event.target.value)} placeholder="例如 local-research-copy" value={renameTo} /> : null}</Field> : null}
        </div> : null}

        <ToolSelection agents={agents} disabled={importing} onToggle={(id, checked) => setAgents((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} tools={tools} />
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{agents.length > 0 ? `将分发到 ${agents.length} 个工具` : "至少选择一个分发目标"}</p><Button disabled={!canImport || importing || conflictCheck.checking} onClick={() => void startImport()}>{importing ? "导入中…" : conflictCheck.checking ? "检查冲突…" : "确认导入"}</Button></div>
      </div>
      </Dialog>
    <Dialog description="目标工具目录中已有非 SkillSage 条目。" onClose={() => setDistributionConflicts(undefined)} open={Boolean(distributionConflicts)} title="处理导入冲突"><div className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertDescription>{distributionConflicts?.map((item) => `${item.toolName}: ${item.path}`).join("；")}</AlertDescription></Alert><p className="text-sm leading-6 text-muted-foreground">跳过会忽略冲突工具；接管会先把原实体迁入中央仓库本地区并改名保存；取消则返回导入流程。</p><div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setDistributionConflicts(undefined)} variant="ghost">取消</Button><Button disabled={importing} onClick={() => void importSkippingConflicts()} variant="outline">跳过冲突项</Button><Button disabled={importing} onClick={() => void importTakingOverConflicts()}>接管并导入</Button></div></div></Dialog>
    </>
  );
}
