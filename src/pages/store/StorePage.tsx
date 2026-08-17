import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/common/PageHeader";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { useSkillInstall } from "../../features/skills/hooks";
import { useDetectedTools } from "../../features/tools/hooks";
import { groupByRepository } from "../../features/store/selectors";
import { useLeaderboard, useSkillDetail, useSkillSearch } from "../../features/store/hooks";
import type { LeaderboardRange, SkillDetail, SkillGroup } from "../../features/store/types";

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
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function LoadingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="加载技能列表" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="surface-card h-48 animate-pulse bg-muted/40" key={index} />
      ))}
    </div>
  );
}

function SkillCard({ group, onOpen }: { group: SkillGroup; onOpen: (skillId: string) => void }) {
  const { primary, additional, source } = group;
  return (
    <button
      className="surface-card interactive-card flex min-h-48 w-full cursor-pointer flex-col p-5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      onClick={() => onOpen(primary.id)}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Sparkles aria-hidden="true" className="h-5 w-5" />
        </div>
        <Badge variant="muted">{primary.sourceType === "github" ? "GitHub" : primary.sourceType}</Badge>
      </div>
      <div className="mt-5 min-w-0">
        <h3 className="truncate text-base font-semibold text-foreground">{primary.name}</h3>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{source}</p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          {formatCount(primary.installs)} installs
        </span>
        {additional.length > 0 ? <span>+{additional.length} more from</span> : <span>查看详情</span>}
      </div>
      {additional.length > 0 ? (
        <p className="mt-2 truncate text-xs text-primary">
          {additional.slice(0, 2).map((skill) => skill.name).join(" · ")}
          {additional.length > 2 ? " · ..." : ""}
        </p>
      ) : null}
    </button>
  );
}

function DetailContent({
  detail,
  installError,
  installMessage,
  installing,
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
  selectedAgents: string[];
  setSelectedAgents: (update: (current: string[]) => string[]) => void;
  stage: string;
  tools: Array<{ id: string; name: string; detected: boolean }>;
  toolsLoading: boolean;
}) {
  const toggleAgent = (agentId: string) => {
    setSelectedAgents((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{detail.source}</Badge>
        <Badge variant="muted">{detail.slug}</Badge>
      </div>
      <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">{detail.description}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">安装量</p>
          <p className="mt-1 text-base font-semibold text-foreground">{formatCount(detail.installs)}</p>
        </div>
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">GitHub Stars</p>
          <p className="mt-1 text-base font-semibold text-foreground">{detail.githubStars ? formatCount(detail.githubStars) : "—"}</p>
        </div>
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">来源</p>
          <p className="mt-1 truncate text-base font-semibold text-foreground">GitHub</p>
        </div>
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">许可</p>
          <p className="mt-1 truncate text-base font-semibold text-foreground">{detail.license ?? "—"}</p>
        </div>
      </div>

      <section className="mt-6 border-t border-border pt-5" aria-labelledby="security-title">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-success" />
          <h3 id="security-title" className="text-sm font-medium text-foreground">安全审计</h3>
        </div>
        {detail.audits.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {detail.audits.map((audit) => (
              <div className="rounded-md border border-border p-3" key={audit.slug}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">{audit.provider}</span>
                  <Badge className={audit.status === "pass" ? "text-success" : "text-warning"} variant="muted">
                    {audit.status}
                  </Badge>
                </div>
                {audit.summary ? <p className="mt-2 text-xs text-muted-foreground">{audit.summary}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">暂无可用的第三方审计结果。</p>
        )}
      </section>

      <section className="mt-6 border-t border-border pt-5" aria-labelledby="install-target-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="install-target-title" className="text-sm font-medium text-foreground">安装到工具</h3>
            <p className="mt-1 text-xs text-muted-foreground">技能内容由 Rust 安装管线落入中央仓库，再按选择创建链接。</p>
          </div>
          <span className="text-xs text-muted-foreground">{selectedAgents.length} 个目标</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {tools.map((tool) => (
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 transition-colors hover:bg-muted" key={tool.id}>
              <span className="flex items-center gap-3">
                <Checkbox
                  checked={selectedAgents.includes(tool.id)}
                  disabled={installing || toolsLoading}
                  onChange={() => toggleAgent(tool.id)}
                />
                <span className="text-sm text-foreground">{tool.name}</span>
              </span>
              {tool.detected ? <Badge variant="success">已检测</Badge> : <Badge variant="muted">未检测</Badge>}
            </label>
          ))}
        </div>
        {installError ? (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive" role="alert">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{installError}</span>
          </div>
        ) : null}
        {installMessage ? <p className="mt-4 text-xs text-muted-foreground" role="status">{installMessage}</p> : null}
        <div className="mt-5 flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
          {installing ? <Badge variant="success">{stageLabels[stage] ?? "处理中"}</Badge> : <span />}
          <Button disabled={installing || selectedAgents.length === 0} onClick={onInstall}>
            <Download aria-hidden="true" className="h-4 w-4" />
            {installing ? "安装中" : "安装技能"}
          </Button>
        </div>
      </section>

      <a className="mt-6 inline-flex items-center gap-2 text-xs text-primary hover:underline" href={detail.url} rel="noreferrer" target="_blank">
        在 skills.sh 查看详情
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function StorePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<LeaderboardRange>("all-time");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const initializedDetail = useRef<string | undefined>(undefined);
  const selectedSkillId = searchParams.get("skill");
  const { error: leaderboardError, loading: leaderboardLoading, skills: leaderboardSkills } = useLeaderboard(range);
  const { error: searchError, loading: searchLoading, skills: searchResults } = useSkillSearch(query);
  const { detail, error: detailError, loading: detailLoading } = useSkillDetail(selectedSkillId);
  const { error: toolsError, loading: toolsLoading, refresh: refreshTools, tools } = useDetectedTools();
  const closeDetail = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("skill");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);
  const installState = useSkillInstall(closeDetail);

  useEffect(() => {
    if (detail && tools.length > 0 && initializedDetail.current !== detail.id) {
      setSelectedAgents(tools.filter((tool) => tool.detected).map((tool) => tool.id));
      initializedDetail.current = detail.id;
    }
  }, [detail, tools]);

  const displaySkills = query.trim().length >= 2 ? searchResults : leaderboardSkills;
  const displayLoading = query.trim().length >= 2 ? searchLoading : leaderboardLoading;
  const displayError = query.trim().length >= 2 ? searchError : leaderboardError;
  const groups = useMemo(() => groupByRepository(displaySkills), [displaySkills]);
  const openDetail = (skillId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("skill", skillId);
    setSearchParams(next);
  };

  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={() => navigate("/skills")} variant="outline">
            我的技能
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        }
        description="从 skills.sh 发现、搜索并安装面向 AI Agent 的能力模块。"
        eyebrow="01 / STORE"
        title="技能商店"
      />

      <section className="surface-card p-5" aria-labelledby="store-search-title">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">DISCOVER</p>
            <h2 id="store-search-title" className="mt-2 text-base font-semibold text-foreground">找到下一项能力</h2>
          </div>
          <GitBranch aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
        </div>
        <label className="relative mt-5 block" htmlFor="skill-search">
          <span className="sr-only">搜索技能</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-12 w-full rounded-md border border-border bg-background pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
            id="skill-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 React、testing、design..."
            type="search"
            value={query}
          />
        </label>
        <p className="mt-3 text-xs text-muted-foreground">输入至少 2 个字符，搜索会实时请求 skills.sh。</p>
      </section>

      <section className="mt-8" aria-labelledby="leaderboard-title">
        <div className="flex items-end justify-between gap-4 max-sm:items-start max-sm:flex-col">
          <div>
            <p className="eyebrow">{query.trim().length >= 2 ? "SEARCH RESULTS" : "LEADERBOARD"}</p>
            <h2 id="leaderboard-title" className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              {query.trim().length >= 2 ? `“${query.trim()}”的搜索结果` : "热门技能"}
            </h2>
          </div>
          {query.trim().length < 2 ? (
            <div className="flex items-center gap-1 rounded-md bg-muted p-1" role="tablist" aria-label="排行榜范围">
              {leaderboardTabs.map((tab) => (
                <button
                  aria-selected={range === tab.value}
                  className={`cursor-pointer rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${range === tab.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  key={tab.value}
                  onClick={() => setRange(tab.value)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {displayError ? (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{displayError}</span>
          </div>
        ) : displayLoading ? (
          <div className="mt-5"><LoadingCards /></div>
        ) : groups.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => <SkillCard group={group} key={group.source} onOpen={openDetail} />)}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              description={query.trim().length >= 2 ? "换一个关键词试试，或者浏览排行榜中的热门技能。" : "暂时没有可展示的技能。"}
              icon={Search}
              title="没有找到技能"
            />
          </div>
        )}
      </section>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-success" />
        同一仓库的技能会聚合展示，安装时仍可单独打开详情并选择工具。
      </div>

      <Dialog
        description={detail?.source ?? "加载技能详情"}
        onClose={closeDetail}
        open={Boolean(selectedSkillId)}
        title={detail?.name ?? "技能详情"}
      >
        {detailLoading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="h-5 w-2/3 animate-pulse rounded-md bg-muted" />
            <div className="h-20 animate-pulse rounded-md bg-muted" />
            <div className="h-24 animate-pulse rounded-md bg-muted" />
          </div>
        ) : detailError ? (
          <div className="flex items-start gap-3 rounded-md bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{detailError}</span>
          </div>
        ) : detail ? (
          <DetailContent
            detail={detail}
            installError={installState.error}
            installMessage={installState.message}
            installing={installState.installing}
            onInstall={() => void installState.install(detail.id, selectedAgents)}
            selectedAgents={selectedAgents}
            setSelectedAgents={setSelectedAgents}
            stage={installState.stage}
            tools={tools}
            toolsLoading={toolsLoading}
          />
        ) : (
          <div className="text-sm text-muted-foreground">无法加载技能详情。</div>
        )}
        {toolsError ? <p className="mt-4 text-xs text-muted-foreground">工具检测提示：{toolsError}</p> : null}
        {selectedSkillId && !toolsLoading ? (
          <button className="mt-4 inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => void refreshTools()} type="button">
            <Star aria-hidden="true" className="h-3.5 w-3.5" />
            刷新工具检测
          </button>
        ) : null}
      </Dialog>
    </div>
  );
}
