import { useCallback, useMemo, useState } from "react";
import {
  CircleAlert,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Flame,
  Rocket,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageHeader } from "../../components/common/PageHeader";
import { PathConflictDialog } from "../../components/common/PathConflictDialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import {
  useInstallConflictCheck,
  useInstalledSkills,
  useSkillInstall,
} from "../../features/skills/hooks";
import { groupByRepository } from "../../features/store/selectors";
import {
  useLeaderboard,
  useSkillDetail,
  useSkillSearch,
} from "../../features/store/hooks";
import type { PathConflict } from "../../features/skills/types";
import type {
  LeaderboardRange,
  SkillDetail,
  SkillGroup,
  SkillSearchResult,
} from "../../features/store/types";

const leaderboardTabs = [
  {
    icon: Flame,
    iconClassName: "text-warning",
    label: "热门",
    value: "all-time",
  },
  {
    icon: TrendingUp,
    iconClassName: "text-primary",
    label: "趋势",
    value: "trending",
  },
  { icon: Rocket, iconClassName: "text-success", label: "爆款", value: "hot" },
] satisfies Array<{
  icon: typeof Flame;
  iconClassName: string;
  label: string;
  value: LeaderboardRange;
}>;

const stageLabels: Record<string, string> = {
  downloading: "下载",
  parsing: "校验",
  distributing: "安装",
  done: "完成",
  failed: "失败",
};

type PendingInstall = {
  conflict: PathConflict;
  skillId: string;
};

function auditStatusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "pass") return "通过";
  if (normalized === "fail" || normalized === "failed") return "未通过";
  return status;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function LoadingCards() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载技能列表"
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton className="h-48 rounded-lg" key={index} />
      ))}
    </div>
  );
}

function SkillCard({
  installedSkillIds,
  group,
  onOpen,
  onQuickInstall,
  quickInstallDisabled,
  quickInstallingSkillId,
}: {
  group: SkillGroup;
  installedSkillIds: ReadonlySet<string>;
  onOpen: (skillId: string) => void;
  onQuickInstall: (skill: SkillSearchResult) => void;
  quickInstallDisabled: boolean;
  quickInstallingSkillId?: string;
}) {
  const { primary, additional, source } = group;
  const installed = installedSkillIds.has(primary.id);
  const quickInstalling = quickInstallingSkillId === primary.id;
  return (
    <Card
      className="cursor-pointer shadow-sm transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={() => onOpen(primary.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(primary.id);
        }
      }}
      aria-label={`${primary.name} 技能详情`}
      role="group"
      tabIndex={0}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-lg">{primary.name}</CardTitle>
          <CardDescription className="mt-1 truncate font-mono text-xs">
            {source}
          </CardDescription>
        </div>
        {installed ? (
          <Button
            aria-label={`${primary.name} 已安装`}
            className="shrink-0"
            disabled
            size="sm"
            variant="secondary"
          >
            <Check data-icon="inline-start" />
            已安装
          </Button>
        ) : (
          <Button
            aria-label={`快速安装 ${primary.name}`}
            className="shrink-0"
            disabled={quickInstallDisabled}
            onClick={(event) => {
              event.stopPropagation();
              void onQuickInstall(primary);
            }}
            onKeyDown={(event) => event.stopPropagation()}
            size="sm"
            variant="outline"
          >
            <Download data-icon="inline-start" />
            {quickInstalling ? "安装中…" : "快速安装"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        <div className="flex min-h-8 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Download aria-hidden="true" className="size-3.5" />
            {formatCount(primary.installs)} 次安装
          </span>
          {additional.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`查看同一仓库中的另外 ${additional.length} 个技能`}
                  className="px-2"
                  onClick={(event) => event.stopPropagation()}
                  size="sm"
                  variant="ghost"
                >
                  同仓库还有 {additional.length} 个
                  <ChevronDown data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64"
                onClick={(event) => event.stopPropagation()}
              >
                <DropdownMenuLabel>同一仓库中的其他技能</DropdownMenuLabel>
                {additional.map((skill) => (
                  <DropdownMenuItem
                    key={skill.id}
                    onSelect={() => onOpen(skill.id)}
                  >
                    {skill.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </CardContent>
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
  stage,
}: {
  detail: SkillDetail;
  installError?: string;
  installMessage: string;
  installing: boolean;
  onInstall: () => void;
  onOpenSettings: () => void;
  stage: string;
}) {
  const auditWarnings = detail.audits.filter(
    (audit) => audit.status.toLowerCase() !== "pass",
  );
  const auditWarningMessage = `审计发现问题：${auditWarnings.map((audit) => `${audit.provider} ${auditStatusLabel(audit.status)}`).join("、")}。请先确认来源和内容。`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{detail.source}</Badge>
        <Badge variant="muted">{detail.slug}</Badge>
      </div>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {detail.description}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["安装量", formatCount(detail.installs)],
          [
            "GitHub Stars",
            detail.githubStars ? formatCount(detail.githubStars) : "—",
          ],
          ["来源", "GitHub"],
          ["许可", detail.license ?? "—"],
        ].map(([label, value]) => (
          <div className="rounded-md bg-muted p-3" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      <Separator />
      <section aria-labelledby="security-title">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-success" />
          <h3
            className="text-sm font-medium text-foreground"
            id="security-title"
          >
            安全审计
          </h3>
          {auditWarnings.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label="安全审计发现问题"
                  className="inline-flex size-4 shrink-0 cursor-help items-center justify-center text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                  role="img"
                  tabIndex={0}
                >
                  <CircleAlert aria-hidden="true" className="size-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm leading-5" sideOffset={6}>
                {auditWarningMessage}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {detail.audits.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {detail.audits.map((audit) => (
              <div
                className="rounded-md border border-border p-3"
                key={audit.slug}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {audit.provider}
                  </span>
                  <Badge
                    variant={
                      audit.status === "pass" ? "success" : "destructive"
                    }
                  >
                    {auditStatusLabel(audit.status)}
                  </Badge>
                </div>
                {audit.summary ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {audit.summary}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            暂无第三方审计结果。
          </p>
        )}
      </section>

      <Separator />
      <section aria-labelledby="install-target-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3
              className="text-sm font-medium text-foreground"
              id="install-target-title"
            >
              安装
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              技能会直接安装到共享技能目录，所有支持该目录的 AI 工具都能立即使用。
            </p>
          </div>
        </div>
        <ErrorBanner
          className="mt-4"
          error={installError}
          onOpenSettings={onOpenSettings}
        />
        {installMessage ? (
          <p className="mt-4 text-xs text-muted-foreground" role="status">
            {installMessage}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-4">
          <div className="flex items-center gap-2">
            {installing ? (
              <Badge variant="success">{stageLabels[stage] ?? "处理中"}</Badge>
            ) : null}
          </div>
          <Button disabled={installing} onClick={onInstall}>
            <Download data-icon="inline-start" />
            {installing ? "安装中" : "开始安装"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function StorePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [isSearchComposing, setIsSearchComposing] = useState(false);
  const [range, setRange] = useState<LeaderboardRange>("all-time");
  const [installConflict, setInstallConflict] = useState<PendingInstall>();
  const [quickInstallingSkillId, setQuickInstallingSkillId] =
    useState<string>();
  const routeSkillId = location.pathname.startsWith("/store/")
    ? decodeRouteSkillId(location.pathname.slice("/store/".length))
    : null;
  const selectedSkillId = routeSkillId || null;
  const {
    error: leaderboardError,
    loading: leaderboardLoading,
    refresh: refreshLeaderboard,
    skills: leaderboardSkills,
  } = useLeaderboard(range);
  const {
    error: searchError,
    loading: searchLoading,
    refresh: refreshSearch,
    skills: searchResults,
  } = useSkillSearch(query, isSearchComposing);
  const {
    detail,
    error: detailError,
    loading: detailLoading,
    refresh: refreshDetail,
  } = useSkillDetail(selectedSkillId);
  const {
    loading: installedLoading,
    refresh: refreshInstalledSkills,
    skills: installedSkills,
  } = useInstalledSkills();
  const closeDetail = useCallback(() => {
    navigate("/store");
  }, [navigate]);
  const handleInstallCompleted = useCallback(() => {
    void refreshInstalledSkills();
    closeDetail();
  }, [closeDetail, refreshInstalledSkills]);
  const installState = useSkillInstall(handleInstallCompleted);
  const conflictCheck = useInstallConflictCheck();

  const isSearching = !isSearchComposing && query.trim().length >= 2;
  const activeLeaderboardLabel =
    leaderboardTabs.find((tab) => tab.value === range)?.label ?? "排行榜";
  const displaySkills = isSearching ? searchResults : leaderboardSkills;
  const displayLoading = isSearching ? searchLoading : leaderboardLoading;
  const displayError = isSearching ? searchError : leaderboardError;
  const groups = useMemo(
    () => groupByRepository(displaySkills),
    [displaySkills],
  );
  const installedSkillIds = useMemo(
    () => new Set(installedSkills.map((skill) => skill.id)),
    [installedSkills],
  );
  const openDetail = (skillId: string) => {
    navigate(`/store/${skillId.split("/").map(encodeURIComponent).join("/")}`);
  };
  const startStoreInstall = async () => {
    if (!detail) return;
    const found = await conflictCheck.check(detail.name);
    if (found) {
      setInstallConflict({ conflict: found, skillId: detail.id });
      return;
    }
    await installState.install(detail.id);
  };
  const quickInstall = async (skill: SkillSearchResult) => {
    if (installedSkillIds.has(skill.id) || installState.installing) {
      return;
    }
    const found = await conflictCheck.check(skill.name);
    if (found) {
      setInstallConflict({ conflict: found, skillId: skill.id });
      return;
    }
    setQuickInstallingSkillId(skill.id);
    try {
      await installState.install(skill.id);
    } finally {
      setQuickInstallingSkillId(undefined);
    }
  };

  return (
    <div>
      <PageHeader description="浏览并安装 AI Agent 技能。" title="技能商店" />

      <section aria-labelledby="leaderboard-title" className="mt-8">
        <div className="flex items-center gap-4">
          <h2 className="sr-only" id="leaderboard-title">
            {isSearching ? `“${query.trim()}”的结果` : "技能排行榜"}
          </h2>
          {!isSearching ? (
            <div className="flex shrink-0 items-center gap-1">
              <Tabs
                onValueChange={(value) => setRange(value as LeaderboardRange)}
                value={range}
              >
                <TabsList
                  aria-label="排行榜范围"
                  className="gap-1 rounded-lg border border-border bg-muted/60 p-1"
                >
                  {leaderboardTabs.map(
                    ({ icon: Icon, iconClassName, label, value }) => (
                      <TabsTrigger
                        className="items-center gap-1 px-2 text-sm data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                        key={value}
                        value={value}
                      >
                        <Icon
                          aria-hidden="true"
                          className={iconClassName}
                          data-icon="inline-start"
                        />
                        {label}
                      </TabsTrigger>
                    ),
                  )}
                </TabsList>
              </Tabs>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`刷新${activeLeaderboardLabel}技能`}
                    disabled={leaderboardLoading}
                    onClick={refreshLeaderboard}
                    size="icon"
                    variant="ghost"
                  >
                    <RefreshCw aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>刷新{activeLeaderboardLabel}技能</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          <div className="relative ml-auto min-w-0 flex-1">
            <label className="sr-only" htmlFor="skill-search">
              搜索技能
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="search-input appearance-none py-0 pl-9 pr-11 font-normal !text-sm !leading-5 placeholder:text-sm placeholder:opacity-80"
              autoComplete="off"
              id="skill-search"
              onChange={(event) => setQuery(event.target.value)}
              onCompositionEnd={() => setIsSearchComposing(false)}
              onCompositionStart={() => setIsSearchComposing(true)}
              placeholder="搜索技能"
              type="search"
              value={query}
            />
            {query ? (
              <Button
                aria-label="清除搜索"
                className="absolute right-0 top-1/2 size-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setIsSearchComposing(false);
                  setQuery("");
                }}
                title="清除搜索"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
        {displayError ? (
          <ErrorBanner
            className="mt-5"
            error={displayError}
            onOpenSettings={() => navigate("/settings")}
            onRetry={isSearching ? refreshSearch : refreshLeaderboard}
          />
        ) : displayLoading ? (
          <div className="mt-5">
            <LoadingCards />
          </div>
        ) : groups.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <SkillCard
                group={group}
                installedSkillIds={installedSkillIds}
                key={group.source}
                onOpen={openDetail}
                onQuickInstall={quickInstall}
                quickInstallDisabled={
                  installedLoading ||
                  installState.installing ||
                  conflictCheck.checking
                }
                quickInstallingSkillId={quickInstallingSkillId}
              />
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              description={
                isSearching
                  ? "换一个关键词试试，或者浏览排行榜中的热门技能。"
                  : "暂时没有可展示的技能。"
              }
              icon={Search}
              title="没有找到技能"
            />
          </div>
        )}
      </section>

      <Dialog
        description={detail?.source ?? "加载技能详情"}
        headerActions={
          detail ? (
            <Button
              aria-label="在 skills.sh 打开详情"
              asChild
              className="size-4"
              size="icon"
              title="在 skills.sh 打开详情"
              variant="ghost"
            >
              <a href={detail.url} rel="noreferrer" target="_blank">
                <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            </Button>
          ) : undefined
        }
        onClose={closeDetail}
        open={Boolean(selectedSkillId)}
        title={detail?.name ?? "技能详情"}
      >
        {detailLoading ? (
          <div aria-busy="true" className="flex flex-col gap-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20" />
            <Skeleton className="h-24" />
          </div>
        ) : detailError ? (
          <ErrorBanner
            error={detailError}
            onOpenSettings={() => navigate("/settings")}
            onRetry={refreshDetail}
          />
        ) : detail ? (
          <DetailContent
            detail={detail}
            installError={installState.error ?? conflictCheck.error}
            installMessage={installState.message}
            installing={installState.installing || conflictCheck.checking}
            onInstall={() => void startStoreInstall()}
            onOpenSettings={() => navigate("/settings")}
            stage={installState.stage}
          />
        ) : (
          <p className="text-sm text-muted-foreground">无法加载技能详情。</p>
        )}
      </Dialog>
      <PathConflictDialog
        busy={installState.installing}
        conflict={installConflict?.conflict}
        onCancel={() => setInstallConflict(undefined)}
        onSkip={() => setInstallConflict(undefined)}
        onTakeover={() => {
          const pending = installConflict;
          setInstallConflict(undefined);
          if (pending) void installState.install(pending.skillId, true);
        }}
      />
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
