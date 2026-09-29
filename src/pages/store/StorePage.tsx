import { useCallback, useMemo, useState } from "react";
import {
  CircleAlert,
  ChevronDown,
  Download,
  ExternalLink,
  Flame,
  LoaderCircle,
  Rocket,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PathConflictDialog } from "../../components/common/PathConflictDialog";
import {
  SkillDescriptionPanel,
  type DescriptionMode,
} from "../../components/common/SkillDescriptionPanel";
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
import { ScrollArea } from "../../components/ui/scroll-area";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { useToast } from "../../components/ui/toast-context";
import {
  useInstallConflictCheck,
  useInstalledSkills,
  useSkillInstall,
  useSkillManagement,
} from "../../features/skills/hooks";
import { groupByRepository } from "../../features/store/selectors";
import {
  useLeaderboard,
  useSkillDetail,
  useSkillDescriptionTranslations,
  useSkillSearch,
} from "../../features/store/hooks";
import { translateSkillDescription } from "../../features/store/api";
import { normalizeTauriError } from "../../lib/tauri";
import type { InstallResult, PathConflict } from "../../features/skills/types";
import type {
  LeaderboardRange,
  SkillDetail,
  SkillGroup,
  SkillSearchResult,
} from "../../features/store/types";

/**
 * Leaderboard ranges. These are a single-select filter over one list, not
 * tabs over separate panels, so they render as a segmented control. The
 * icons stay in one neutral tone and only the active segment takes the
 * accent — three differently-coloured icons competed with the content and
 * broke the system's one-accent rule.
 */
const leaderboardRanges = [
  { icon: Flame, label: "热门", value: "all-time" },
  { icon: TrendingUp, label: "趋势", value: "trending" },
  { icon: Rocket, label: "爆款", value: "hot" },
] satisfies Array<{
  icon: typeof Flame;
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

/** Built once. Constructing an `Intl.NumberFormat` per call measured ~26x
 * slower than reusing one, and `formatCount` runs for every card on every
 * render — the card grid re-renders on each keystroke of the search box. */
const compactCount = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCount(value: number) {
  return compactCount.format(value);
}

function LoadingCards() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载技能列表"
      // Mirrors the real grid's container queries so the skeleton occupies the
      // same columns and the layout does not jump when results arrive.
      className="@container"
    >
      <div className="grid items-start gap-3 @lg:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
        {/* Ten fills the widest layout (4 columns x 2.5 rows) and still covers
            a 3-column grid at 1440px, so the first paint matches what replaces
            it instead of showing a short page that then grows. */}
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton className="h-28 rounded-lg" key={index} />
        ))}
      </div>
    </div>
  );
}

function SkillCard({
  group,
  installedSkillIds,
  onOpen,
  onQuickInstall,
  onUninstall,
  actionsDisabled,
  quickInstallingSkillId,
}: {
  group: SkillGroup;
  installedSkillIds: ReadonlySet<string>;
  onOpen: (skillId: string) => void;
  onQuickInstall: (skill: SkillSearchResult) => void;
  onUninstall: (skill: { id: string; name: string }) => void;
  /** Gates whichever action the card offers — install or uninstall. */
  actionsDisabled: boolean;
  quickInstallingSkillId?: string;
}) {
  const { primary, additional, source } = group;
  const installed = installedSkillIds.has(primary.id);
  const quickInstalling = quickInstallingSkillId === primary.id;
  return (
    <Card
      className="h-full cursor-pointer gap-0 py-0 shadow-sm transition-[background-color,border-color] duration-150 hover:border-primary/30 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
      {/* No description here: it is long, variable, and the reason cards used to
          differ in height. It stays available in the detail dialog one click
          away. Without it every card has the same two-line head and one-line
          foot, so the grid rows come out even with nothing padded out. */}
      <CardHeader className="flex flex-row items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm font-medium">
            {primary.name}
          </CardTitle>
          <CardDescription className="mt-0.5 truncate font-mono text-xs">
            {source}
          </CardDescription>
        </div>
        {installed ? (
          // 卸载 rather than a disabled 已安装 badge. The card already said it was
          // installed; a disabled control told the user nothing and left them to
          // go to 我的技能 to undo it. Both buttons stop propagation, because the
          // whole card is the detail link.
          <Button
            aria-label={`卸载 ${primary.name}`}
            className="shrink-0"
            disabled={actionsDisabled}
            onClick={(event) => {
              event.stopPropagation();
              onUninstall({ id: primary.id, name: primary.name });
            }}
            onKeyDown={(event) => event.stopPropagation()}
            size="sm"
            variant="destructive"
          >
            <Trash2 data-icon="inline-start" />
            卸载
          </Button>
        ) : (
          <Button
            aria-label={`快速安装 ${primary.name}`}
            className="shrink-0"
            disabled={actionsDisabled}
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
      <CardContent className="mt-auto p-4 pt-0">
        {/* The footer row keeps a fixed height. Without it the row is as tall
            as its own content, so a card with the "same repository" button
            (32px) sat its installs text 9px higher than a card without one —
            the two cards in a row visibly disagreed on where the baseline was.
            `min-h-8` matches the button height, so the text lands in the same
            place either way. */}
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
                  // The mouse path is guarded above, but Radix's trigger only
                  // preventDefaults Enter/Space without stopping propagation,
                  // so the Card's keydown handler would also open the primary
                  // skill on top of the menu.
                  onKeyDown={(event) => event.stopPropagation()}
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
  descriptionMode,
  detail,
  installError,
  onDescriptionModeChange,
  onOpenSettings,
  onTranslate,
  translation,
  translationError,
  translationLoading,
}: {
  descriptionMode: DescriptionMode;
  detail: SkillDetail;
  installError?: string;
  onDescriptionModeChange: (mode: DescriptionMode) => void;
  onOpenSettings: () => void;
  onTranslate: () => void;
  translation?: string;
  translationError?: string;
  translationLoading: boolean;
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

      <SkillDescriptionPanel
        description={detail.description}
        descriptionMode={descriptionMode}
        onDescriptionModeChange={onDescriptionModeChange}
        onTranslate={onTranslate}
        translatedDescription={translation}
        translationError={translationError}
        translationLoading={translationLoading}
      />

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
          <div
            className="rounded-lg border border-border bg-muted/30 p-3"
            key={label}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      <section
        aria-labelledby="security-title"
        className="rounded-lg border border-border p-4"
      >
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

      <section
        aria-labelledby="install-target-title"
        className="rounded-lg border border-border p-4"
      >
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
  const [uninstallTarget, setUninstallTarget] = useState<{
    id: string;
    name: string;
  }>();
  const [quickInstallingSkillId, setQuickInstallingSkillId] =
    useState<string>();
  const [descriptionModes, setDescriptionModes] = useState<
    Record<string, DescriptionMode>
  >({});
  const [translationLoadingSkillId, setTranslationLoadingSkillId] =
    useState<string>();
  const [translationErrors, setTranslationErrors] = useState<
    Record<string, string>
  >({});
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
    save: saveTranslation,
    translations,
  } = useSkillDescriptionTranslations();
  const {
    loading: installedLoading,
    refresh: refreshInstalledSkills,
    skills: installedSkills,
  } = useInstalledSkills();
  const closeDetail = useCallback(() => {
    navigate("/store");
  }, [navigate]);
  const { toast } = useToast();
  const handleInstallCompleted = useCallback(
    (result: InstallResult) => {
      // Confirm before closing. The dialog disappears the moment the install
      // resolves, so without a toast a successful install had no visible result
      // at all — the only feedback was the card quietly switching to 已安装.
      toast({
        description: `“${result.name}” 已安装到共享技能目录。`,
        title: "安装完成",
        variant: "success",
      });
      void refreshInstalledSkills();
      closeDetail();
    },
    [closeDetail, refreshInstalledSkills, toast],
  );
  const installState = useSkillInstall(handleInstallCompleted);
  const conflictCheck = useInstallConflictCheck();
  // Same hook 我的技能 uses, so both pages take the same backend path
  // (`uninstall_skill`), the same per-skill busy state, and the same refresh.
  const management = useSkillManagement(() => {
    void refreshInstalledSkills();
  });
  const confirmUninstall = async () => {
    if (!uninstallTarget) return;
    const result = await management.uninstall(uninstallTarget.id);
    // The confirmation dialog closes here, so the outcome has to be reported
    // before it goes — the same rule the install path follows.
    if (result !== undefined) {
      toast({
        description: `“${uninstallTarget.name}” 已从共享技能目录移除。`,
        title: "卸载完成",
        variant: "success",
      });
    }
    setUninstallTarget(undefined);
  };

  const isSearching = !isSearchComposing && query.trim().length >= 2;
  const activeLeaderboardLabel =
    leaderboardRanges.find((item) => item.value === range)?.label ?? "排行榜";
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
    // Clear a previous quick-install failure so it cannot surface in the
    // detail dialog of an unrelated skill.
    installState.clearError();
    navigate(`/store/${skillId.split("/").map(encodeURIComponent).join("/")}`);
  };
  const startStoreInstall = async () => {
    // Same guard as `quickInstall`. The button is disabled while installing, but
    // the handler should not depend on that alone: the conflict check awaits
    // before the install begins, so a second activation during that await would
    // otherwise start a second install of the same skill.
    if (!detail || installState.installing || conflictCheck.checking) return;
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
  const translateDescription = async () => {
    if (!detail) return;
    const cachedTranslation = translations[detail.id];
    if (cachedTranslation) {
      setDescriptionModes((current) => ({
        ...current,
        [detail.id]: "translated",
      }));
      return;
    }

    setTranslationLoadingSkillId(detail.id);
    setTranslationErrors((current) => {
      if (!current[detail.id]) return current;
      const next = { ...current };
      delete next[detail.id];
      return next;
    });
    try {
      const translated = await translateSkillDescription(detail.description);
      await saveTranslation(detail.id, translated);
      setDescriptionModes((current) => ({
        ...current,
        [detail.id]: "translated",
      }));
    } catch (reason) {
      setTranslationErrors((current) => ({
        ...current,
        [detail.id]: normalizeTauriError(reason),
      }));
    } finally {
      // Only clear the spinner if this skill is still the one translating;
      // otherwise a late completion would hide another skill's progress.
      setTranslationLoadingSkillId((current) =>
        current === detail.id ? undefined : current,
      );
    }
  };
  const detailTranslation = detail
    ? translations[detail.id]
    : undefined;
  const detailDescriptionMode = detail
    ? descriptionModes[detail.id] ??
      (detailTranslation ? "translated" : "original")
    : "original";
  const detailTranslationLoading =
    translationLoadingSkillId === detail?.id;
  // The store's own id space matches the installed list's, so the same lookup the
  // grid uses answers "is the skill I am looking at already installed".
  const detailInstalled = detail ? installedSkillIds.has(detail.id) : false;
  const detailBusy =
    installState.installing ||
    conflictCheck.checking ||
    management.pendingActions.has(detail?.id ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The page name lives in the title bar. The store's own controls are
          list filters, so they stay in the card toolbar rather than moving
          up. */}
      {/* Quick install happens on the grid, where the detail dialog (the only
          other place install errors render) is not open. Surface failures here
          so a failed quick install is never silent. */}
      {!selectedSkillId && (installState.error ?? conflictCheck.error) ? (
        <ErrorBanner
          className="mb-4"
          error={installState.error ?? conflictCheck.error}
          onOpenSettings={() => navigate("/settings")}
        />
      ) : null}

      {/* Same workspace shape as 我的技能: one Card whose header is the
          toolbar and whose body is the only scrolling region. */}
      <section
        aria-labelledby="leaderboard-title"
        className="flex min-h-0 flex-1 flex-col"
      >
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex shrink-0 flex-wrap items-center gap-3 bg-muted/20 p-4">
              <h2 className="sr-only" id="leaderboard-title">
                {isSearching ? `“${query.trim()}”的结果` : "技能排行榜"}
              </h2>
              {!isSearching ? (
                <div className="flex shrink-0 items-center gap-2">
                  {/* A segmented single-select. ToggleGroup already owns the
                      roving focus, keyboard handling and pressed state, so the
                      active segment needs no hand-written ring or shadow. */}
                  <ToggleGroup
                    aria-label="排行榜范围"
                    className="rounded-lg border border-border bg-muted/60 p-0.5"
                    onValueChange={(value) => {
                      if (value) setRange(value as LeaderboardRange);
                    }}
                    type="single"
                    value={range}
                  >
                    {leaderboardRanges.map(({ icon: Icon, label, value }) => (
                      <ToggleGroupItem
                        className="h-7 gap-1.5 px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                        key={value}
                        size="sm"
                        value={value}
                      >
                        <Icon aria-hidden="true" data-icon="inline-start" />
                        {label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
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
                    <TooltipContent>
                      刷新{activeLeaderboardLabel}技能
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : null}
              <div className="relative ml-auto min-w-56 flex-1 basis-56">
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
            <Separator className="shrink-0 bg-foreground/20" />
            {displayError ? (
              <div className="p-4">
                <ErrorBanner
                  error={displayError}
                  onOpenSettings={() => navigate("/settings")}
                  onRetry={isSearching ? refreshSearch : refreshLeaderboard}
                />
              </div>
            ) : displayLoading ? (
              <div className="p-4">
                <LoadingCards />
              </div>
            ) : groups.length > 0 ? (
              <ScrollArea className="min-h-0 flex-1">
                {/* Container queries, not viewport breakpoints: the grid lives
                    in a container 228px narrower than the viewport, so `xl:`
                    (1280px) would not produce a third column until the window
                    reached ~1508px. Keyed to the container, the columns track
                    the space the grid actually has. */}
                <div className="@container p-4">
                  {/* Equal-height cards: `items-stretch` (the grid default)
                      plus `h-full` on the card, with the footer pinned by
                      `mt-auto`. Every card has the same two-line head and
                      one-line foot now that the variable description is gone,
                      so the rows come out even without padding anything out. */}
                  <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
                {groups.map((group) => (
                  <SkillCard
                    group={group}
                    installedSkillIds={installedSkillIds}
                    key={group.source}
                    onOpen={openDetail}
                    onQuickInstall={quickInstall}
                    onUninstall={setUninstallTarget}
                    actionsDisabled={
                      installedLoading ||
                      installState.installing ||
                      conflictCheck.checking
                    }
                    quickInstallingSkillId={quickInstallingSkillId}
                  />
                ))}
              </div>
            </div>
              </ScrollArea>
            ) : (
              <div className="p-4">
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
          </CardContent>
        </Card>
      </section>

      <Dialog
        description={detail?.source ?? "加载技能详情"}
        footer={
          detail ? (
            // The footer states what this skill's state allows: install when it
            // is not here, uninstall when it is. It used to say 开始安装 for an
            // already-installed skill, which is the one thing the user cannot
            // usefully do from here.
            detailInstalled ? (
              <Button
                aria-busy={detailBusy}
                disabled={detailBusy}
                onClick={() =>
                  setUninstallTarget({ id: detail.id, name: detail.name })
                }
                variant="destructive"
              >
                <Trash2 data-icon="inline-start" />
                {management.pendingActions.get(detail.id) === "uninstall"
                  ? "卸载中…"
                  : "卸载"}
              </Button>
            ) : (
              <Button
                aria-busy={installState.installing || conflictCheck.checking}
                disabled={installState.installing || conflictCheck.checking}
                onClick={() => void startStoreInstall()}
              >
                {installState.installing ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <Download data-icon="inline-start" />
                )}
                {installState.installing
                  ? `${stageLabels[installState.stage] ?? "处理中"}…`
                  : "开始安装"}
              </Button>
            )
          ) : undefined
        }
        headerActions={
          detail ? (
            <Button
              aria-label="在 skills.sh 打开详情"
              asChild
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
            descriptionMode={detailDescriptionMode}
            detail={detail}
            installError={installState.error ?? conflictCheck.error}
            onDescriptionModeChange={(mode) => {
              setDescriptionModes((current) => ({
                ...current,
                [detail.id]: mode,
              }));
            }}
            onOpenSettings={() => navigate("/settings")}
            onTranslate={() => void translateDescription()}
            translation={detailTranslation}
            translationError={detail ? translationErrors[detail.id] : undefined}
            translationLoading={detailTranslationLoading}
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
      {/* Same copy and same shape as 我的技能's single-skill uninstall, so one
          action reads the same wherever it is taken from. */}
      <ConfirmDialog
        confirmDisabled={
          management.pendingActions.get(uninstallTarget?.id ?? "") === "uninstall"
        }
        confirmLabel={
          management.pendingActions.get(uninstallTarget?.id ?? "") ===
          "uninstall"
            ? "卸载中"
            : "卸载"
        }
        confirmVariant="destructive"
        description={`会删除“${uninstallTarget?.name}”在共享目录中的文件夹和记录，所有读取该目录的 AI 工具会立即失去这个技能，不影响其他技能。`}
        onConfirm={() => void confirmUninstall()}
        onOpenChange={(open) => !open && setUninstallTarget(undefined)}
        open={Boolean(uninstallTarget)}
        title="确认卸载"
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
