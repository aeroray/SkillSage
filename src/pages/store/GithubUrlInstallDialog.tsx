import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, GitBranch, Link2 } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { ToolSelection, type ToolOption } from "../../components/common/ToolSelection";
import { useGithubUrlInstall } from "../../features/url-install/hooks";

type GithubUrlInstallDialogProps = {
  onClose: () => void;
  onCompleted: () => void;
  open: boolean;
  tools: ToolOption[];
};

export function GithubUrlInstallDialog({ onClose, onCompleted, open, tools }: GithubUrlInstallDialogProps) {
  const [url, setUrl] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const initializedAgents = useRef(false);
  const handleCompleted = useCallback(() => {
    onCompleted();
    onClose();
  }, [onClose, onCompleted]);
  const { error, inspect, inspection, installing, loading, reset, install } = useGithubUrlInstall(handleCompleted);

  useEffect(() => {
    if (open && !initializedAgents.current && tools.length > 0) {
      setAgents(tools.filter((tool) => tool.detected).map((tool) => tool.id));
      initializedAgents.current = true;
    }
    if (!open) {
      setUrl("");
      setSelectedPath("");
      setAgents([]);
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

  return (
    <Dialog description="支持仓库地址、tree/blob 技能地址和 SKILL.md 直链。" onClose={onClose} open={open} title="从 GitHub URL 安装">
      <div className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="github-url">GitHub 地址</FieldLabel>
            <FieldDescription id="github-url-help">仓库级地址会先列出仓库中的技能，选择后再安装。</FieldDescription>
            <div className="flex items-center gap-2"><Input aria-describedby="github-url-help" id="github-url" onChange={(event) => { setUrl(event.target.value); reset(); }} placeholder="https://github.com/owner/repo/tree/main/skill" value={url} /><Button disabled={!url.trim() || loading || installing} onClick={() => void inspect(url)} variant="secondary">{loading ? "解析中…" : "解析地址"}</Button></div>
          </Field>
        </FieldGroup>

        {error ? <Alert variant="destructive"><CircleAlert /><AlertDescription>{error}</AlertDescription></Alert> : null}
        {inspection ? <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2"><GitBranch aria-hidden="true" className="h-4 w-4" /><p className="text-sm font-medium text-foreground">{inspection.parsed.owner}/{inspection.parsed.repo}</p><Badge variant="muted">{inspection.skills.length} 个技能</Badge></div>
          {inspection.skills.length > 1 ? <Field><FieldLabel htmlFor="github-skill-path">选择技能</FieldLabel><Select onValueChange={(value) => setSelectedPath(value === "__root__" ? "" : value)} value={selectedPath || "__root__"}><SelectTrigger id="github-skill-path"><SelectValue placeholder="选择仓库中的技能" /></SelectTrigger><SelectContent><SelectGroup>{inspection.skills.map((skill) => <SelectItem key={skill.skillPath || "root"} value={skill.skillPath || "__root__"}>{skill.name} · {skill.skillPath || "仓库根目录"}</SelectItem>)}</SelectGroup></SelectContent></Select></Field> : null}
          {selectedSkill ? <div className="rounded-md border border-border bg-card p-3"><div className="flex items-center gap-2"><Link2 aria-hidden="true" className="h-4 w-4 text-primary" /><p className="text-sm font-medium text-foreground">{selectedSkill.name}</p></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedSkill.description}</p><p className="mt-2 text-xs text-muted-foreground">技能路径：{selectedSkill.skillPath || "仓库根目录"}</p></div> : null}
        </div> : null}

        <ToolSelection agents={agents} disabled={installing} onToggle={(id, checked) => setAgents((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} tools={tools} />
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{agents.length > 0 ? `将分发到 ${agents.length} 个工具` : "至少选择一个分发目标"}</p><Button disabled={!canInstall || installing} onClick={() => { if (inspection) void install(url, selectedPath || undefined, agents); }}><GitBranch data-icon="inline-start" />{installing ? "安装中…" : "安装技能"}</Button></div>
      </div>
    </Dialog>
  );
}
