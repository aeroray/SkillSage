import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { ArrowRight, Check, CircleAlert, Download, FolderOpen, Library, MoreHorizontal, PackageOpen, RefreshCw, Search, Settings2, SlidersHorizontal, Trash2, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/common/PageHeader";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog } from "../../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useDetectedTools } from "../../features/tools/hooks";
import { useInstalledSkills, usePhase2Install, useSkillManagement, useSkillUpdates } from "../../features/skills/hooks";
import type { InstalledSkill } from "../../features/skills/types";

type SourceFilter = "all" | "skills.sh" | "builtin";
type StatusFilter = "all" | "update" | "current";
type SortMode = "recent" | "name" | "source";

function sourceLabel(source: string) {
  if (source.startsWith("builtin://")) return "内置 fixture";
  if (source.includes("skills.sh")) return "skills.sh";
  return source.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/");
}

function shortVersion(version: string) {
  return version.length > 12 ? version.slice(0, 8) : version;
}

function ToolPicker({ agents, onToggle, tools }: { agents: string[]; onToggle: (id: string, checked: boolean) => void; tools: { id: string; name: string; detected: boolean }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {tools.map((tool) => {
        const checkboxId = `tool-${tool.id}`;
        return (
          <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border px-3 transition-colors hover:bg-muted" key={tool.id}>
            <div className="flex items-center gap-3"><Checkbox checked={agents.includes(tool.id)} id={checkboxId} onCheckedChange={(checked) => onToggle(tool.id, checked === true)} /><Label className="font-normal" htmlFor={checkboxId}>{tool.name}</Label></div>
            {tool.detected ? <Badge variant="success">已检测</Badge> : <Badge variant="muted">未检测</Badge>}
          </div>
        );
      })}
    </div>
  );
}

function SkillRow({ checked, onAdjust, onCheck, onHistory, onUninstall, onUpdate, pending, skill, updateAvailable }: { checked: boolean; onAdjust: (skill: InstalledSkill) => void; onCheck: (checked: boolean) => void; onHistory: (skill: InstalledSkill) => void; onUninstall: (skill: InstalledSkill) => void; onUpdate: (skill: InstalledSkill) => void; pending: boolean; skill: InstalledSkill; updateAvailable: boolean }) {
  return (
    <div className="grid gap-4 border-b border-border px-5 py-4 last:border-b-0 lg:grid-cols-[auto_minmax(0,1fr)_180px_150px_auto] lg:items-center">
      <Checkbox aria-label={`选择 ${skill.name}`} checked={checked} onCheckedChange={(value) => onCheck(value === true)} />
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium text-foreground">{skill.name}</h3><Badge variant="muted">{skill.owner}</Badge>{updateAvailable ? <Badge variant="success">有更新</Badge> : null}</div><p className="mt-1 truncate text-xs text-muted-foreground">{skill.description || "暂无描述"}</p></div>
      <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground"><p>{sourceLabel(skill.source)}</p>{skill.distributedTo.length > 0 ? <Badge variant="success">已分发 · {skill.distributedTo.length}</Badge> : <Badge variant="muted">未分发</Badge>}</div>
      <div className="text-xs text-muted-foreground"><p className="font-medium text-foreground">{shortVersion(skill.currentVersion)}</p><p className="mt-1">{skill.currentHash.slice(0, 10)}</p></div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button aria-label={`打开 ${skill.name} 操作菜单`} size="icon" variant="ghost"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuGroup>
          <DropdownMenuItem disabled={pending || !updateAvailable} onSelect={() => onUpdate(skill)}><Download />{updateAvailable ? "更新" : "已是最新"}</DropdownMenuItem>
          <DropdownMenuItem disabled={pending || skill.versionHistory.length === 0} onSelect={() => onHistory(skill)}><Undo2 />版本历史</DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => onAdjust(skill)}><Settings2 />调整分发</DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => onUninstall(skill)} variant="destructive"><Trash2 />卸载</DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SkillsPage() {
  const navigate = useNavigate();
  const { error: toolsError, loading: toolsLoading, refresh: refreshTools, tools } = useDetectedTools();
  const { error: skillsError, loading: skillsLoading, refresh: refreshSkills, skills } = useInstalledSkills();
  const { check: checkUpdatesNow, checking: updatesChecking, error: updatesError, updates } = useSkillUpdates();
  const refreshPage = useCallback(() => { void refreshSkills(); void checkUpdatesNow(); }, [checkUpdatesNow, refreshSkills]);
  const management = useSkillManagement(refreshPage);
  const installState = usePhase2Install(refreshPage);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tool, setTool] = useState("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [batchAgents, setBatchAgents] = useState<string[]>([]);
  const [distributionSkill, setDistributionSkill] = useState<InstalledSkill>();
  const [distributionAgents, setDistributionAgents] = useState<string[]>([]);
  const [historySkill, setHistorySkill] = useState<InstalledSkill>();
  const [uninstallTarget, setUninstallTarget] = useState<InstalledSkill>();
  const [batchOpen, setBatchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const initializedAgents = useRef(false);

  useEffect(() => {
    if (!initializedAgents.current && tools.length > 0) {
      const detectedAgents = tools.filter((item) => item.detected).map((item) => item.id);
      setSelectedAgents(detectedAgents);
      setBatchAgents(detectedAgents);
      initializedAgents.current = true;
    }
  }, [tools]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => skills.some((skill) => skill.id === id)));
  }, [skills]);

  useEffect(() => { if (!skillsLoading) void checkUpdatesNow(); }, [checkUpdatesNow, skillsLoading]);

  const updatesById = useMemo(() => new Map(updates.map((item) => [item.id, item])), [updates]);
  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...skills].filter((skill) => {
      const updateAvailable = updatesById.get(skill.id)?.updateAvailable ?? false;
      const matchesQuery = !query || [skill.name, skill.owner, skill.description, skill.source].join(" ").toLowerCase().includes(query);
      const matchesSource = source === "all" || (source === "builtin" && skill.source.startsWith("builtin://")) || (source === "skills.sh" && !skill.source.startsWith("builtin://"));
      const matchesStatus = status === "all" || (status === "update" && updateAvailable) || (status === "current" && !updateAvailable);
      const matchesTool = tool === "all" || skill.distributedTo.includes(tool);
      return matchesQuery && matchesSource && matchesStatus && matchesTool;
    }).sort((left, right) => sort === "name" ? left.name.localeCompare(right.name) : sort === "source" ? sourceLabel(left.source).localeCompare(sourceLabel(right.source)) : right.installedAt.localeCompare(left.installedAt));
  }, [search, skills, sort, source, status, tool, updatesById]);

  const groups = useMemo(() => {
    const grouped = new Map<string, InstalledSkill[]>();
    for (const skill of filteredSkills) grouped.set(skill.owner, [...(grouped.get(skill.owner) ?? []), skill]);
    return [...grouped.entries()];
  }, [filteredSkills]);

  const filteredIds = filteredSkills.map((skill) => skill.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
  const pageError = toolsError ?? skillsError ?? updatesError ?? management.error ?? installState.error;
  const openDistribution = (skill: InstalledSkill) => { setDistributionSkill(skill); setDistributionAgents(skill.distributedTo); };
  const confirmUninstall = async () => { if (!uninstallTarget) return; await management.uninstall(uninstallTarget.id); setUninstallTarget(undefined); };

  return (
    <div>
      <PageHeader actions={<Button onClick={() => navigate("/store")}>技能商店<ArrowRight data-icon="inline-end" /></Button>} description="集中查看、更新、回滚和分发已安装的技能。" eyebrow="02 / LIBRARY" title="我的技能" />
      {pageError ? <Alert className="mb-6" variant="destructive"><CircleAlert /><AlertDescription>{pageError}</AlertDescription></Alert> : null}

      <Card className="mb-6"><CardHeader className="flex flex-row items-center justify-between gap-4"><div className="flex items-center gap-4"><div className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary"><Library aria-hidden="true" className="h-5 w-5" /></div><div><CardTitle>中央技能仓库</CardTitle><CardDescription className="mt-1">~/.skillsage/remote · 单一数据源</CardDescription></div></div><div className="flex items-center gap-2"><Badge variant="muted">{skills.length} 个技能</Badge><Button aria-label="刷新技能与工具状态" disabled={skillsLoading || toolsLoading || updatesChecking} onClick={() => { void refreshSkills(); void refreshTools(); void checkUpdatesNow(); }} size="icon" variant="ghost"><RefreshCw /></Button></div></CardHeader></Card>

      <Card className="mb-6"><CardContent className="flex flex-col gap-4 p-4"><div className="flex flex-wrap items-center gap-3"><label className="relative min-w-56 flex-1"><span className="sr-only">搜索已安装技能</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="搜索技能、作者或描述" value={search} /></label><Select onValueChange={(value) => setSource(value as SourceFilter)} value={source}><SelectTrigger aria-label="来源筛选" className="w-36"><SelectValue placeholder="来源" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部来源</SelectItem><SelectItem value="skills.sh">skills.sh</SelectItem><SelectItem value="builtin">内置 fixture</SelectItem></SelectGroup></SelectContent></Select><Select onValueChange={(value) => setStatus(value as StatusFilter)} value={status}><SelectTrigger aria-label="状态筛选" className="w-36"><SelectValue placeholder="状态" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部状态</SelectItem><SelectItem value="update">有可用更新</SelectItem><SelectItem value="current">已是最新</SelectItem></SelectGroup></SelectContent></Select><Select onValueChange={setTool} value={tool}><SelectTrigger aria-label="工具筛选" className="w-40"><SelectValue placeholder="工具" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部工具</SelectItem>{tools.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select><Select onValueChange={(value) => setSort(value as SortMode)} value={sort}><SelectTrigger aria-label="排序方式" className="w-36"><SelectValue placeholder="排序" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="recent">最近安装</SelectItem><SelectItem value="name">名称</SelectItem><SelectItem value="source">来源</SelectItem></SelectGroup></SelectContent></Select></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><div className="flex items-center gap-2"><Checkbox checked={allFilteredSelected} id="select-filtered" onCheckedChange={(checked) => setSelectedIds((current) => checked === true ? [...new Set([...current, ...filteredIds])] : current.filter((id) => !filteredIds.includes(id)))} /><Label className="font-normal text-muted-foreground" htmlFor="select-filtered">选择当前筛选结果 ({selectedIds.length})</Label></div><div className="flex items-center gap-2"><Button disabled={selectedIds.length === 0 || Boolean(management.pending)} onClick={() => setBatchOpen(true)} variant="outline"><SlidersHorizontal data-icon="inline-start" />批量分发</Button><Button disabled={updatesChecking} onClick={() => void checkUpdatesNow()} variant="secondary"><RefreshCw data-icon="inline-start" />{updatesChecking ? "检查中" : "检查更新"}</Button><Button onClick={() => setImportOpen(true)} variant="outline"><FolderOpen data-icon="inline-start" />导入技能</Button></div></div></CardContent></Card>

      {skills.length === 0 ? <><Card className="mb-6"><CardHeader className="flex flex-row items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Badge>Phase 2</Badge><span className="text-xs text-muted-foreground">本地验证 fixture</span></div><CardTitle className="mt-4">安装测试技能</CardTitle><CardDescription className="mt-2">使用内置 fixture 验证本地仓库、lock 记录和工具分发链路，不访问网络。</CardDescription></div><Button disabled={installState.installing} onClick={() => void installState.install(selectedAgents)}>{installState.installing ? "安装中" : "安装测试技能"}</Button></CardHeader>{installState.message ? <CardContent className="pt-0 text-xs text-muted-foreground">{installState.message}</CardContent> : null}</Card><EmptyState action={<Button onClick={() => navigate("/store")} variant="secondary">发现更多技能<ArrowRight data-icon="inline-end" /></Button>} description="从技能商店安装技能后，它们会出现在这里，并可以按作者分组管理。" icon={PackageOpen} title="还没有已安装技能" /></> : groups.length === 0 ? <EmptyState description="调整搜索条件或筛选器，查看已安装的技能。" icon={Search} title="没有匹配的技能" /> : <Accordion className="flex flex-col gap-4" defaultValue={groups.map(([owner]) => owner)} type="multiple">{groups.map(([owner, ownerSkills]) => <AccordionItem className="rounded-lg border border-border bg-card shadow-sm" key={owner} value={owner}><AccordionTrigger className="px-5 py-4 hover:no-underline"><div className="flex items-center gap-3"><span className="text-sm font-semibold text-foreground">{owner}</span><Badge variant="muted">{ownerSkills.length} 个技能</Badge></div></AccordionTrigger><AccordionContent className="pb-0"><div>{ownerSkills.map((skill) => <SkillRow checked={selectedIds.includes(skill.id)} key={skill.id} onAdjust={openDistribution} onCheck={(checked) => setSelectedIds((current) => checked ? [...new Set([...current, skill.id])] : current.filter((id) => id !== skill.id))} onHistory={setHistorySkill} onUninstall={setUninstallTarget} onUpdate={(item) => void management.update(item.id)} pending={management.pending === skill.id} skill={skill} updateAvailable={updatesById.get(skill.id)?.updateAvailable ?? false} />)}</div></AccordionContent></AccordionItem>)}</Accordion>}

      {skills.length > 0 ? <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />中央仓库内容更新时，分发链接无需重复创建。</p> : null}

      <Dialog description="选择要保留的工具分发目标。" onClose={() => setDistributionSkill(undefined)} open={Boolean(distributionSkill)} title="调整分发"><ToolPicker agents={distributionAgents} onToggle={(id, checked) => setDistributionAgents((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} tools={tools} /><div className="mt-6 flex justify-end gap-2"><Button onClick={() => setDistributionSkill(undefined)} variant="ghost">取消</Button><Button disabled={!distributionSkill || Boolean(management.pending)} onClick={async () => { if (!distributionSkill) return; const result = await management.adjust(distributionSkill.id, distributionAgents); if (result) setDistributionSkill(undefined); }}>保存分发设置</Button></div></Dialog>
      <Dialog description={`已选择 ${selectedIds.length} 个技能。`} onClose={() => setBatchOpen(false)} open={batchOpen} title="批量分发"><ToolPicker agents={batchAgents} onToggle={(id, checked) => setBatchAgents((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} tools={tools} /><div className="mt-6 flex justify-end gap-2"><Button onClick={() => setBatchOpen(false)} variant="ghost">取消</Button><Button disabled={selectedIds.length === 0 || Boolean(management.pending)} onClick={async () => { const result = await management.distribute(selectedIds, batchAgents); if (result) { setBatchOpen(false); setSelectedIds([]); } }}>应用到选中技能</Button></div></Dialog>
      <Dialog description="回滚会创建新的版本历史记录，当前版本仍可再次恢复。" onClose={() => setHistorySkill(undefined)} open={Boolean(historySkill)} title="版本历史"><div className="flex flex-col gap-3">{(historySkill?.versionHistory ?? []).slice().reverse().map((version) => <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3" key={`${version.commit}-${version.hash}`}><div className="min-w-0"><p className="text-sm font-medium text-foreground">{shortVersion(version.commit)}</p><p className="mt-1 text-xs text-muted-foreground">hash {version.hash.slice(0, 12)} · {version.recordedAt}</p></div><Button disabled={Boolean(management.pending)} onClick={async () => { if (!historySkill) return; const result = await management.rollback(historySkill.id, version.commit); if (result) setHistorySkill(undefined); }} variant="outline">回滚</Button></div>)}</div></Dialog>
      <AlertDialog onOpenChange={(open) => !open && setUninstallTarget(undefined)} open={Boolean(uninstallTarget)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认卸载</AlertDialogTitle><AlertDialogDescription>卸载只会移除分发链接、中央仓库内容和 lock 记录，不会影响其他技能。</AlertDialogDescription></AlertDialogHeader><p className="text-sm leading-6 text-muted-foreground">确定要卸载“{uninstallTarget?.name}”吗？</p><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction disabled={Boolean(management.pending)} onClick={() => void confirmUninstall()} variant="destructive">{management.pending ? "卸载中" : "确认卸载"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Dialog description="本地目录导入将在下一阶段接入统一校验和来源记录。" onClose={() => setImportOpen(false)} open={importOpen} title="导入技能"><div className="rounded-md border border-border bg-muted/40 p-4"><p className="text-sm font-medium text-foreground">Phase 5 功能</p><p className="mt-2 text-sm leading-6 text-muted-foreground">当前版本先从 skills.sh 安装并管理远程技能；本地导入入口已预留，待导入协议与安全校验完成后启用。</p></div><div className="mt-6 flex justify-end"><Button onClick={() => setImportOpen(false)} variant="secondary">知道了</Button></div></Dialog>
    </div>
  );
}
