import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Download,
  ExternalLink,
  GitBranch,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageHeader } from "../../components/common/PageHeader";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useDistributionConflicts, useSkillInstall } from "../../features/skills/hooks";
import { GithubUrlInstallDialog } from "./GithubUrlInstallDialog";
import { useDetectedTools } from "../../features/tools/hooks";
import { groupByRepository } from "../../features/store/selectors";
import { useLeaderboard, useSkillDetail, useSkillSearch } from "../../features/store/hooks";
import type { DistributionConflict } from "../../features/skills/types";
import type { LeaderboardRange, SkillDetail, SkillGroup } from "../../features/store/types";
import { displayPath } from "../../lib/paths";

const leaderboardTabs: Array<{ label: string; value: LeaderboardRange }> = [
  { label: "热门", value: "all-time" },
  { label: "趋势", value: "trending" },
  { label: "爆款", value: "hot" },
];

const stageLabels: Record<string, string> = {
  downloading: "下载中",
  parsing: "校验中",
  distributing: "分发中",
  done: "已完成",
  failed: "失败",
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function LoadingCards() {
  return (
    <div aria-busy="true" aria-label="正在加载技能列表" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-48 rounded-lg" key={index} />)}
    </div>
  );
}

function SkillCard({ group, onOpen }: { group: SkillGroup; onOpen: (skillId: string) => void }) {
  const { primary, additional, source } = group;
  return (
    <Card
      className="h-full min-h-48 cursor-pointer shadow-sm transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={() => onOpen(primary.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen(primary.id);
      }}
      role="button"
      tabIndex={0}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Sparkles aria-hidden="true" className="h-5 w-5" />
        </div>
        <Badge variant="muted">{primary.sourceType === "github" ? "GitHub" : primary.sourceType}</Badge>
      </CardHeader>
      <CardContent className="min-w-0 flex-1">
        <CardTitle className="truncate">{primary.name}</CardTitle>
        <CardDescription className="mt-1 truncate font-mono text-xs">{source}</CardDescription>
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Download aria-hidden="true" className="h-3.5 w-3.5" />{formatCount(primary.installs)} installs</span>
        <span>{additional.length > 0 ? `+${additional.length} more` : "查看详情"}</span>
      </CardFooter>
      {additional.length > 0 ? <CardContent className="bg-muted/40 px-4 py-3 text-xs text-primary"><p className="truncate">{additional.slice(0, 2).map((skill) => skill.name).join(" · ")}{additional.length > 2 ? " · ..." : ""}</p></CardContent> : null}
    </Card>
  );
}

function DetailContent({
  detail,
  installError,
  installMessage,
  installing,
  onOpenSettings,
  onInstall,
  selectedAgents,
  setSelectedAgents,
  stage,
  tools,
  toolsLoading,
}: {
  detail: SkillDetail;
  installError?: string;
  installMessage: string;
  installing: boolean;
  onInstall: () => void;
  onOpenSettings: () => void;
  selectedAgents: string[];
  setSelectedAgents: Dispatch<SetStateAction<string[]>>;
  stage: string;
  tools: Array<{ id: string; name: string; detected: boolean }>;
  toolsLoading: boolean;
}) {
  const toggleAgent = (agentId: string, checked: boolean) => {
    setSelectedAgents((current) => checked ? [...current, agentId] : current.filter((id) => id !== agentId));
  };
  const auditWarnings = detail.audits.filter((audit) => audit.status.toLowerCase() !== "pass");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2"><Badge>{detail.source}</Badge><Badge variant="muted">{detail.slug}</Badge></div>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{detail.description}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["安装量", formatCount(detail.installs)],
          ["GitHub Stars", detail.githubStars ? formatCount(detail.githubStars) : "—"],
          ["来源", "GitHub"],
          ["许可", detail.license ?? "—"],
        ].map(([label, value]) => <div className="rounded-md bg-muted p-3" key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-base font-semibold text-foreground">{value}</p></div>)}
      </div>

      <Separator />
      <section aria-labelledby="security-title">
        <div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-success" /><h3 className="text-sm font-medium text-foreground" id="security-title">安全审计</h3></div>
        {detail.audits.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-3">{detail.audits.map((audit) => <div className="rounded-md border border-border p-3" key={audit.slug}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium text-foreground">{audit.provider}</span><Badge variant={audit.status === "pass" ? "success" : "destructive"}>{audit.status}</Badge></div>{audit.summary ? <p className="mt-2 text-xs text-muted-foreground">{audit.summary}</p> : null}</div>)}</div> : <p className="mt-3 text-xs text-muted-foreground">暂无可用的第三方审计结果。</p>}
      </section>

      <Separator />
      {auditWarnings.length > 0 ? <Alert className="mb-6" variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>安全审计存在 {auditWarnings.map((audit) => `${audit.provider}: ${audit.status}`).join("、")}，请在安装前确认来源和内容。</AlertDescription></Alert> : null}
      <section aria-labelledby="install-target-title">
        <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-medium text-foreground" id="install-target-title">安装到工具</h3><p className="mt-1 text-xs text-muted-foreground">技能内容由 Rust 安装管线落入中央仓库，再按选择创建链接。</p></div><span className="text-xs text-muted-foreground">{selectedAgents.length} 个目标</span></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{tools.map((tool) => <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 transition-colors hover:bg-muted" key={tool.id}><span className="flex items-center gap-3"><Checkbox checked={selectedAgents.includes(tool.id)} disabled={installing || toolsLoading} onCheckedChange={(checked) => toggleAgent(tool.id, checked === true)} /><span className="text-sm text-foreground">{tool.name}</span></span>{tool.detected ? <Badge variant="success">已检测</Badge> : <Badge variant="muted">未检测</Badge>}</label>)}</div>
        <ErrorBanner className="mt-4" error={installError} onOpenSettings={onOpenSettings} />
        {installMessage ? <p className="mt-4 text-xs text-muted-foreground" role="status">{installMessage}</p> : null}
        <div className="mt-5 flex items-center justify-between gap-4"><div>{installing ? <Badge variant="success">{stageLabels[stage] ?? "处理中"}</Badge> : null}</div><Button disabled={installing || selectedAgents.length === 0} onClick={onInstall}><Download data-icon="inline-start" />{installing ? "安装中" : "安装技能"}</Button></div>
      </section>

      <a className="inline-flex items-center gap-2 text-xs text-primary hover:underline" href={detail.url} rel="noreferrer" target="_blank">在 skills.sh 查看详情<ExternalLink aria-hidden="true" /></a>
    </div>
  );
}

export function StorePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<LeaderboardRange>("all-time");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [githubUrlOpen, setGithubUrlOpen] = useState(false);
  const [installConflicts, setInstallConflicts] = useState<DistributionConflict[]>();
  const initializedDetail = useRef<string | undefined>(undefined);
  const routeSkillId = location.pathname.startsWith("/store/")
    ? decodeRouteSkillId(location.pathname.slice("/store/".length))
    : null;
  const selectedSkillId = routeSkillId || null;
  const { error: leaderboardError, loading: leaderboardLoading, refresh: refreshLeaderboard, skills: leaderboardSkills } = useLeaderboard(range);
  const { error: searchError, loading: searchLoading, refresh: refreshSearch, skills: searchResults } = useSkillSearch(query);
  const { detail, error: detailError, loading: detailLoading, refresh: refreshDetail } = useSkillDetail(selectedSkillId);
  const { error: toolsError, loading: toolsLoading, refresh: refreshTools, tools } = useDetectedTools();
  const closeDetail = useCallback(() => { navigate("/store"); }, [navigate]);
  const installState = useSkillInstall(closeDetail);
  const conflictCheck = useDistributionConflicts();

  useEffect(() => {
    if (detail && tools.length > 0 && initializedDetail.current !== detail.id) {
      setSelectedAgents(tools.filter((tool) => tool.detected).map((tool) => tool.id));
      initializedDetail.current = detail.id;
    }
  }, [detail, tools]);

  const isSearching = query.trim().length >= 2;
  const displaySkills = isSearching ? searchResults : leaderboardSkills;
  const displayLoading = isSearching ? searchLoading : leaderboardLoading;
  const displayError = isSearching ? searchError : leaderboardError;
  const groups = useMemo(() => groupByRepository(displaySkills), [displaySkills]);
  const openDetail = (skillId: string) => { navigate(`/store/${skillId.split("/").map(encodeURIComponent).join("/")}`); };
  const startStoreInstall = async () => {
    if (!detail) return;
    const conflicts = await conflictCheck.check(detail.name, selectedAgents);
    if (conflicts.length > 0) {
      setInstallConflicts(conflicts);
      return;
    }
    await installState.install(detail.id, selectedAgents);
  };
  const installSkippingConflicts = async () => {
    if (!detail || !installConflicts) return;
    const blocked = new Set(installConflicts.map((item) => item.toolId));
    setInstallConflicts(undefined);
    await installState.install(detail.id, selectedAgents.filter((agent) => !blocked.has(agent)));
  };
  const installTakingOverConflicts = async () => {
    if (!detail || !installConflicts) return;
    const actions = Object.fromEntries(installConflicts.map((item) => [item.toolId, "takeover" as const]));
    setInstallConflicts(undefined);
    await installState.install(detail.id, selectedAgents, actions);
  };

  return (
    <div>
      <PageHeader actions={<><Button onClick={() => setGithubUrlOpen(true)} variant="outline"><GitBranch data-icon="inline-start" />GitHub URL</Button><Button onClick={() => navigate("/skills")} variant="outline">我的技能<ArrowRight data-icon="inline-end" /></Button></>} description="从 skills.sh 发现、搜索并安装面向 AI Agent 的能力模块。" eyebrow="02 / STORE" title="技能商店" />

      <section aria-labelledby="store-search-title" className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">DISCOVER</p><h2 className="mt-2 text-base font-semibold text-foreground" id="store-search-title">找到下一项能力</h2></div><GitBranch aria-hidden="true" className="h-5 w-5 text-muted-foreground" /></div>
        <label className="relative mt-5 block" htmlFor="skill-search"><span className="sr-only">搜索技能</span><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-12 pl-11 pr-4" id="skill-search" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 React、testing、design..." type="search" value={query} /></label>
        <p className="mt-3 text-xs text-muted-foreground">输入至少 2 个字符，搜索会实时请求 skills.sh。</p>
      </section>

      <section aria-labelledby="leaderboard-title" className="mt-8">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isSearching ? "SEARCH RESULTS" : "LEADERBOARD"}</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground" id="leaderboard-title">{isSearching ? `“${query.trim()}” 的搜索结果` : "热门技能"}</h2></div>{!isSearching ? <Tabs onValueChange={(value) => setRange(value as LeaderboardRange)} value={range}><TabsList aria-label="排行榜范围">{leaderboardTabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}</TabsList></Tabs> : null}</div>
        {displayError ? <ErrorBanner className="mt-5" error={displayError} onOpenSettings={() => navigate("/settings")} onRetry={isSearching ? refreshSearch : refreshLeaderboard} /> : displayLoading ? <div className="mt-5"><LoadingCards /></div> : groups.length > 0 ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groups.map((group) => <SkillCard group={group} key={group.source} onOpen={openDetail} />)}</div> : <div className="mt-5"><EmptyState description={isSearching ? "换一个关键词试试，或者浏览排行榜中的热门技能。" : "暂时没有可展示的技能。"} icon={Search} title="没有找到技能" /></div>}
      </section>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-success" />同一仓库的技能会聚合展示，安装时仍可单独打开详情并选择工具。</div>

      <Dialog description={detail?.source ?? "加载技能详情"} onClose={closeDetail} open={Boolean(selectedSkillId)} title={detail?.name ?? "技能详情"}>
        {detailLoading ? <div aria-busy="true" className="flex flex-col gap-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-20" /><Skeleton className="h-24" /></div> : detailError ? <ErrorBanner error={detailError} onOpenSettings={() => navigate("/settings")} onRetry={refreshDetail} /> : detail ? <DetailContent detail={detail} installError={installState.error ?? conflictCheck.error} installMessage={installState.message} installing={installState.installing || conflictCheck.checking} onInstall={() => void startStoreInstall()} onOpenSettings={() => navigate("/settings")} selectedAgents={selectedAgents} setSelectedAgents={setSelectedAgents} stage={installState.stage} tools={tools} toolsLoading={toolsLoading} /> : <p className="text-sm text-muted-foreground">无法加载技能详情。</p>}
        {toolsError ? <ErrorBanner className="mt-4" error={toolsError} onRetry={() => void refreshTools()} /> : null}
        {selectedSkillId && !toolsLoading ? <Button className="mt-4" onClick={() => void refreshTools()} size="sm" variant="ghost"><Star data-icon="inline-start" />刷新工具检测</Button> : null}
      </Dialog>
      <Dialog description="目标工具目录中已有非 SkillSage 条目。" onClose={() => setInstallConflicts(undefined)} open={Boolean(installConflicts)} title="处理安装冲突"><div className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertDescription>{installConflicts?.map((item) => `${item.toolName}: ${displayPath(item.path)}`).join("；")}</AlertDescription></Alert><p className="text-sm leading-6 text-muted-foreground">跳过会忽略冲突工具；接管会先把原实体迁入中央仓库本地区并改名保存；取消则返回安装流程。</p><div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setInstallConflicts(undefined)} variant="ghost">取消</Button><Button disabled={installState.installing} onClick={() => void installSkippingConflicts()} variant="outline">跳过冲突项</Button><Button disabled={installState.installing} onClick={() => void installTakingOverConflicts()}>接管并安装</Button></div></div></Dialog>
      <GithubUrlInstallDialog onClose={() => setGithubUrlOpen(false)} onCompleted={() => undefined} onOpenSettings={() => navigate("/settings")} open={githubUrlOpen} tools={tools} />
    </div>
  );
}

function decodeRouteSkillId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
