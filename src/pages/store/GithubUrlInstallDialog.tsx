import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, GitBranch, Link2 } from "lucide-react";
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
import { useDistributionConflicts } from "../../features/skills/hooks";
import type { DistributionConflict } from "../../features/skills/types";
import { useGithubUrlInstall } from "../../features/url-install/hooks";

type GithubUrlInstallDialogProps = {
  onClose: () => void;
  onCompleted: () => void;
  onOpenSettings?: () => void;
  open: boolean;
  tools: ToolOption[];
};

export function GithubUrlInstallDialog({ onClose, onCompleted, onOpenSettings, open, tools }: GithubUrlInstallDialogProps) {
  const [url, setUrl] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<DistributionConflict[]>();
  const initializedAgents = useRef(false);
  const handleCompleted = useCallback(() => {
    onCompleted();
    onClose();
  }, [onClose, onCompleted]);
  const { error, inspect, inspection, installing, loading, reset, install } = useGithubUrlInstall(handleCompleted);
  const conflictCheck = useDistributionConflicts();

  useEffect(() => {
    if (open && !initializedAgents.current && tools.length > 0) {
      setAgents(tools.filter((tool) => tool.detected).map((tool) => tool.id));
      initializedAgents.current = true;
    }
    if (!open) {
      setUrl("");
      setSelectedPath("");
      setAgents([]);
      setConflicts(undefined);
      initializedAgents.current = false;
      reset();
    }
  }, [open, reset, tools]);

  useEffect(() => {
    const first = inspection?.skills[0]?.skillPath;
    if (first !== undefined) setSelectedPath(first);
  }, [inspection]);

  const selectedSkill = inspection?.skills.find((skill) => skill.skillPath === selectedPath);
  const canInstall = Boolean(inspection && selectedSkill && agents.length > 0);
  const startInstall = async () => {
    if (!inspection || !selectedSkill) return;
    const nextConflicts = await conflictCheck.check(selectedSkill.name, agents);
    if (nextConflicts.length > 0) {
      setConflicts(nextConflicts);
      return;
    }
    await install(url, selectedPath || undefined, agents);
  };
  const installSkippingConflicts = async () => {
    if (!selectedSkill || !conflicts) return;
    const blocked = new Set(conflicts.map((item) => item.toolId));
    setConflicts(undefined);
    await install(url, selectedPath || undefined, agents.filter((agent) => !blocked.has(agent)));
  };
  const installTakingOverConflicts = async () => {
    if (!selectedSkill || !conflicts) return;
    const actions = Object.fromEntries(conflicts.map((item) => [item.toolId, "takeover" as const]));
    setConflicts(undefined);
    await install(url, selectedPath || undefined, agents, actions);
  };

  return (
    <>
      <Dialog description="支持仓库地址、tree/blob 技能地址和 SKILL.md 直链。" onClose={onClose} open={open} title="从 GitHub URL 安装">
      <div className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="github-url">GitHub 地址</FieldLabel>
            <FieldDescription id="github-url-help">仓库级地址会先列出仓库中的技能，选择后再安装。</FieldDescription>
            <div className="flex items-center gap-2"><Input aria-describedby="github-url-help" id="github-url" onChange={(event) => { setUrl(event.target.value); reset(); }} placeholder="https://github.com/owner/repo/tree/main/skill" value={url} /><Button disabled={!url.trim() || loading || installing} onClick={() => void inspect(url)} variant="secondary">{loading ? "解析中…" : "解析地址"}</Button></div>
          </Field>
        </FieldGroup>

        <ErrorBanner error={error} onOpenSettings={onOpenSettings} />
        <ErrorBanner error={conflictCheck.error} onOpenSettings={onOpenSettings} />
        {loading ? <div aria-busy="true" className="flex flex-col gap-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-16" /></div> : null}
        {inspection ? <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2"><GitBranch aria-hidden="true" className="h-4 w-4" /><p className="text-sm font-medium text-foreground">{inspection.parsed.owner}/{inspection.parsed.repo}</p><Badge variant="muted">{inspection.skills.length} 个技能</Badge></div>
          {inspection.skills.length > 1 ? <Field><FieldLabel htmlFor="github-skill-path">选择技能</FieldLabel><Select onValueChange={(value) => setSelectedPath(value === "__root__" ? "" : value)} value={selectedPath || "__root__"}><SelectTrigger id="github-skill-path"><SelectValue placeholder="选择仓库中的技能" /></SelectTrigger><SelectContent><SelectGroup>{inspection.skills.map((skill) => <SelectItem key={skill.skillPath || "root"} value={skill.skillPath || "__root__"}>{skill.name} · {skill.skillPath || "仓库根目录"}</SelectItem>)}</SelectGroup></SelectContent></Select></Field> : null}
          {selectedSkill ? <div className="rounded-md border border-border bg-card p-3"><div className="flex items-center gap-2"><Link2 aria-hidden="true" className="h-4 w-4 text-primary" /><p className="text-sm font-medium text-foreground">{selectedSkill.name}</p></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedSkill.description}</p><p className="mt-2 text-xs text-muted-foreground">技能路径：{selectedSkill.skillPath || "仓库根目录"}</p></div> : null}
        </div> : null}

        <ToolSelection agents={agents} disabled={installing} onToggle={(id, checked) => setAgents((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} tools={tools} />
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{agents.length > 0 ? `将分发到 ${agents.length} 个工具` : "至少选择一个分发目标"}</p><Button disabled={!canInstall || installing || conflictCheck.checking} onClick={() => void startInstall()}><GitBranch data-icon="inline-start" />{installing ? "安装中…" : conflictCheck.checking ? "检查冲突…" : "安装技能"}</Button></div>
      </div>
      </Dialog>
      <Dialog description="目标工具目录中已有非 SkillSage 条目。" onClose={() => setConflicts(undefined)} open={Boolean(conflicts)} title="处理安装冲突"><div className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertDescription>{conflicts?.map((item) => `${item.toolName}: ${item.path}`).join("；")}</AlertDescription></Alert><p className="text-sm leading-6 text-muted-foreground">跳过会忽略冲突工具；接管会先把原实体迁入中央仓库本地区并改名保存；取消则返回安装流程。</p><div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setConflicts(undefined)} variant="ghost">取消</Button><Button disabled={installing} onClick={() => void installSkippingConflicts()} variant="outline">跳过冲突项</Button><Button disabled={installing} onClick={() => void installTakingOverConflicts()}>接管并安装</Button></div></div></Dialog>
    </>
  );
}
