import { useEffect, useState } from "react";
import { GitBranch, Link2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PathConflictDialog } from "../../components/common/PathConflictDialog";
import { useInstallConflictCheck } from "../../features/skills/hooks";
import type { PathConflict } from "../../features/skills/types";
import { useGithubUrlInstall } from "../../features/url-install/hooks";

type GithubUrlInstallDialogProps = {
  onClose: () => void;
  onCompleted: () => void;
  onOpenSettings?: () => void;
  open: boolean;
};

export function GithubUrlInstallDialog({ onClose, onCompleted, onOpenSettings, open }: GithubUrlInstallDialogProps) {
  const [url, setUrl] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [pathConflict, setPathConflict] = useState<PathConflict>();
  const handleCompleted = () => {
    onCompleted();
    onClose();
  };
  const { error, inspect, inspection, installing, loading, reset, install } = useGithubUrlInstall(handleCompleted);
  const conflictCheck = useInstallConflictCheck();

  useEffect(() => {
    if (!open) {
      setUrl("");
      setSelectedPath("");
      setPathConflict(undefined);
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    const first = inspection?.skills[0]?.skillPath;
    if (first !== undefined) setSelectedPath(first);
  }, [inspection]);

  const selectedSkill = inspection?.skills.find((skill) => skill.skillPath === selectedPath);
  const canInstall = Boolean(inspection && selectedSkill);
  const startInstall = async () => {
    if (!inspection || !selectedSkill) return;
    const found = await conflictCheck.check(selectedSkill.name);
    if (found) {
      setPathConflict(found);
      return;
    }
    await install(url, selectedPath || undefined);
  };

  return (
    <>
      <Dialog description="支持 GitHub 仓库、技能目录和 SKILL.md 直链。" onClose={onClose} open={open} title="从 GitHub URL 安装">
      <div className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="github-url">GitHub 地址</FieldLabel>
            <FieldDescription id="github-url-help">仓库地址会先列出技能，选择后再安装。</FieldDescription>
            <div className="flex items-center gap-2"><Input aria-describedby="github-url-help" id="github-url" onChange={(event) => { setUrl(event.target.value); reset(); }} placeholder="https://github.com/owner/repo/tree/main/skill" value={url} /><Button disabled={!url.trim() || loading || installing} onClick={() => void inspect(url)} variant="secondary">{loading ? "读取中…" : "读取地址"}</Button></div>
          </Field>
        </FieldGroup>

        <ErrorBanner error={error ?? conflictCheck.error} onOpenSettings={onOpenSettings} />
        {loading ? <div aria-busy="true" className="flex flex-col gap-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-16" /></div> : null}
        {inspection ? <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2"><GitBranch aria-hidden="true" className="h-4 w-4" /><p className="text-sm font-medium text-foreground">{inspection.parsed.owner}/{inspection.parsed.repo}</p><Badge variant="muted">{inspection.skills.length} 个技能</Badge></div>
          {inspection.skills.length > 1 ? <Field><FieldLabel htmlFor="github-skill-path">选择要安装的技能</FieldLabel><Select onValueChange={(value) => setSelectedPath(value === "__root__" ? "" : value)} value={selectedPath || "__root__"}><SelectTrigger id="github-skill-path"><SelectValue placeholder="选择仓库中的技能" /></SelectTrigger><SelectContent><SelectGroup>{inspection.skills.map((skill) => <SelectItem key={skill.skillPath || "root"} value={skill.skillPath || "__root__"}>{skill.name} · {skill.skillPath || "仓库根目录"}</SelectItem>)}</SelectGroup></SelectContent></Select></Field> : null}
          {selectedSkill ? <div className="rounded-md border border-border bg-card p-3"><div className="flex items-center gap-2"><Link2 aria-hidden="true" className="h-4 w-4 text-primary" /><p className="text-sm font-medium text-foreground">{selectedSkill.name}</p></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedSkill.description}</p><p className="mt-2 text-xs text-muted-foreground">路径：{selectedSkill.skillPath || "仓库根目录"}</p></div> : null}
        </div> : null}

        <div className="flex items-center justify-end gap-3"><Button disabled={!canInstall || installing || conflictCheck.checking} onClick={() => void startInstall()}><GitBranch data-icon="inline-start" />{installing ? "安装中…" : conflictCheck.checking ? "检查冲突…" : "开始安装"}</Button></div>
      </div>
      </Dialog>
      <PathConflictDialog
        busy={installing}
        conflict={pathConflict}
        onCancel={() => setPathConflict(undefined)}
        onSkip={() => { setPathConflict(undefined); onClose(); }}
        onTakeover={() => { setPathConflict(undefined); void install(url, selectedPath || undefined, true); }}
      />
    </>
  );
}
