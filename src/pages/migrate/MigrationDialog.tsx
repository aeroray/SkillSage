import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FolderSync, ScanSearch } from "lucide-react";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { useMigration } from "../../features/migrate";
import type { MigrateItem } from "../../features/migrate";
import type { ToolOption } from "../../components/common/ToolSelection";

type MigrationDialogProps = {
  onClose: () => void;
  onCompleted: () => void;
  open: boolean;
  tools: ToolOption[];
};

function classificationLabel(classification: string) {
  if (classification === "remote") return "远程归属";
  if (classification === "local") return "本地实体";
  return "未知来源";
}

export function MigrationDialog({ onClose, onCompleted, open, tools }: MigrationDialogProps) {
  const { error, execute, executing, runScan, scan, scanning } = useMigration();
  const [selected, setSelected] = useState<string[]>([]);
  const [agents, setAgents] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (open) void runScan();
    else {
      setSelected([]);
      setAgents({});
      setMessage(undefined);
    }
  }, [open, runScan]);

  useEffect(() => {
    if (!scan) return;
    const eligible = scan.items.filter((item) => item.canTakeover);
    setSelected(eligible.map((item) => item.id));
    setAgents(Object.fromEntries(eligible.map((item) => [item.id, item.toolIds])));
  }, [scan]);

  const eligible = useMemo(() => scan?.items.filter((item) => item.canTakeover) ?? [], [scan]);
  const submit = async () => {
    const result = await execute(selected.map((id) => ({ sourcePath: id, agents: agents[id] ?? [] })));
    if (!result) return;
    setMessage(`已接管 ${result.migrated.length} 个技能，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`);
    if (result.migrated.length > 0) onCompleted();
  };

  return <Dialog description="扫描工具目录和公共技能目录，将外部实体移入中央仓库并重建链接。" onClose={onClose} open={open} title="迁移存量技能">
    <div className="flex flex-col gap-5">
      <ErrorBanner error={error} onRetry={() => void runScan()} />
      {message ? <Alert><FolderSync /><AlertDescription>{message}</AlertDescription></Alert> : null}
      {scanning ? <div aria-busy="true" className="flex flex-col gap-3 rounded-md border border-border p-4"><div className="flex items-center gap-3 text-sm text-muted-foreground"><ScanSearch />正在扫描工具目录与 ~/.agents/skills…</div><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div> : null}
      {scan && !scanning ? <>
        <Card><CardHeader><CardTitle className="text-base">扫描结果</CardTitle><CardDescription>发现 {scan.items.length} 个条目，可接管 {eligible.length} 个。未知来源链接不会自动移动。</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
          {scan.items.length === 0 ? <p className="text-sm text-muted-foreground">没有发现可迁移的存量技能。</p> : scan.items.map((item: MigrateItem) => <div className="flex items-start gap-3 rounded-md border border-border p-3" key={item.id}>
            <Checkbox aria-label={`选择迁移 ${item.name}`} checked={selected.includes(item.id)} disabled={!item.canTakeover || executing} onCheckedChange={(checked) => setSelected((current) => checked === true ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} />
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-foreground">{item.name}</p><Badge variant={item.classification === "remote" ? "default" : item.classification === "local" ? "secondary" : "muted"}>{classificationLabel(item.classification)}</Badge><Badge variant="muted">{item.location === "public" ? "公共目录" : "工具目录"}</Badge></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description || "无法读取描述"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.sourcePath}</p>{item.warning ? <p className="mt-1 text-xs text-warning">{item.warning}</p> : null}<div className="mt-2 flex flex-wrap gap-1">{item.toolIds.map((toolId) => <Badge key={toolId} variant="outline">{tools.find((tool) => tool.id === toolId)?.name ?? toolId}</Badge>)}</div></div>
          </div>)}
        </CardContent></Card>
        {selected.length > 0 ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowRight />接管后技能会进入 `~/.skillsage/`，原目录不再由原工具管理。</p> : null}
        <div className="flex items-center justify-between gap-3"><Label className="text-xs text-muted-foreground">已选择 {selected.length} 个</Label><Button disabled={selected.length === 0 || executing} onClick={() => void submit()}>{executing ? "迁移中…" : "确认接管"}</Button></div>
      </> : null}
    </div>
  </Dialog>;
}
