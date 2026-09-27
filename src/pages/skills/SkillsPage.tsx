import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ArrowRight,
  CircleAlert,
  Circle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  FolderOpen,
  GitBranch,
  GitCommit,
  Info,
  Library,
  LoaderCircle,
  Link2,
  MinusCircle,
  MoreHorizontal,
  RefreshCw,
  ScanSearch,
  Search,
  Share2,
  SquareArrowRightEnter,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageActions } from "../../components/layout/page-actions";
import { ImportDialog } from "../import/ImportDialog";
import { GithubUrlInstallDialog } from "../store/GithubUrlInstallDialog";
import {
  SkillDescriptionPanel,
  type DescriptionMode,
} from "../../components/common/SkillDescriptionPanel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Separator } from "../../components/ui/separator";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Skeleton } from "../../components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { useToast } from "../../components/ui/toast-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import {
  openSkillDirectory,
  openSkillsRoot,
  searchLocalSkillMatches,
} from "../../features/skills/api";
import { translateSkillDescription } from "../../features/store/api";
import {
  distributionTargetsFor,
  useInstalledSkills,
  useSkillManagement,
  useSkillUpdates,
} from "../../features/skills/hooks";
import { useSkillDescriptionTranslations } from "../../features/store/hooks";
import type {
  InstalledSkill,
  LocalSkillMatch,
  ToolOption,
} from "../../features/skills/types";
import {
  countSkillsBySource,
  countSkillsByStatus,
  filterAndSortSkills,
  groupByAuthor,
  isRemoteUpdateable,
  searchSkills,
  sourceLabel,
  type SkillSortDirection,
  type SkillSortMode,
  type SkillSourceFilter,
  type SkillStatusFilter,
} from "../../features/skills/selectors";
import { normalizeTauriError } from "../../lib/tauri";

function shortRevision(revision: string) {
  return revision.length > 12 ? revision.slice(0, 8) : revision;
}

const SOURCE_FILTERS: Array<{ label: string; value: SkillSourceFilter }> = [
  { label: "全部", value: "all" },
  { label: "远端", value: "remote" },
  { label: "本地", value: "local" },
  { label: "内置", value: "builtin" },
];

const STATUS_FILTERS: Array<{ label: string; value: SkillStatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "有更新", value: "update" },
  { label: "已最新", value: "current" },
  { label: "无更新源", value: "no-source" },
];

function formatInstalledAt(value: string) {
  const numeric = Number(value);
  const date = Number.isNaN(numeric)
    ? new Date(value)
    : new Date(numeric * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function SkillsLoadingState() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载已安装技能"
      className="flex flex-col gap-4"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index}>
          <CardContent className="flex items-center gap-4 p-5">
            <Skeleton className="size-4" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SkillDetailField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-muted/30 p-3 ${wide ? "sm:col-span-2" : ""}`}
    >
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-foreground">
        {value}
      </dd>
    </div>
  );
}

function SkillDetailContent({
  descriptionMode,
  detectedTools,
  skill,
  skillsRoot,
  tools,
  onDescriptionModeChange,
  onTranslate,
  translatedDescription,
  translationError,
  translationLoading,
}: {
  descriptionMode: DescriptionMode;
  detectedTools: string[];
  skill: InstalledSkill;
  skillsRoot?: string;
  tools: ToolOption[];
  onDescriptionModeChange: (mode: DescriptionMode) => void;
  onTranslate: () => void;
  translatedDescription?: string;
  translationError?: string;
  translationLoading: boolean;
}) {
  const skillPath = skill.skillPath
    ? skill.skillPath
    : skill.skillPath === ""
      ? "仓库根目录"
      : "未记录";
  const installedAt =
    formatInstalledAt(skill.installedAt) || skill.installedAt || "未记录";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted">{skill.source || "本地技能"}</Badge>
        {/* Only tools installed on this machine (plus any that already hold a
            link), so the detail view does not list the whole registry. */}
        {distributionTargetsFor(tools, detectedTools, skill).map((tool) => {
          const distributed = skill.distributedTo.includes(tool.id);
          return (
            <Badge key={tool.id} variant={distributed ? "success" : "muted"}>
              {tool.label} · {distributed ? "已分发" : "未分发"}
            </Badge>
          );
        })}
      </div>

      <SkillDescriptionPanel
        description={skill.description}
        descriptionMode={descriptionMode}
        onDescriptionModeChange={onDescriptionModeChange}
        onTranslate={onTranslate}
        translatedDescription={translatedDescription}
        translationError={translationError}
        translationLoading={translationLoading}
      />

      <dl className="grid gap-3 sm:grid-cols-2">
        <SkillDetailField label="技能 ID" value={skill.id || "未记录"} />
        <SkillDetailField label="作者" value={skill.owner || "未记录"} />
        <SkillDetailField label="仓库" value={skill.repo || "未记录"} />
        <SkillDetailField label="来源路径" value={skillPath} />
        <SkillDetailField
          label="技能根目录"
          value={skillsRoot || "未记录"}
          wide
        />
        <SkillDetailField label="来源" value={skill.source || "未记录"} wide />
        <SkillDetailField
          label="来源提交"
          value={skill.currentVersion || "未记录"}
        />
        <SkillDetailField label="安装时间" value={installedAt} />
        <SkillDetailField
          label="内容指纹"
          value={skill.currentHash || "未记录"}
          wide
        />
      </dl>
    </div>
  );
}

function LocalMatchContent({
  candidates,
  error,
  loading,
  onLink,
  onSearchMore,
  pending,
  showSearchMore,
}: {
  candidates: LocalSkillMatch[];
  error?: string;
  loading: boolean;
  onLink: (candidate: LocalSkillMatch) => void;
  onSearchMore: () => void;
  pending: boolean;
  showSearchMore: boolean;
}) {
  const exactCandidate = candidates.find(
    (candidate) => candidate.verification === "exact",
  );
  const verificationLabel = (candidate: LocalSkillMatch) => {
    if (candidate.verification === "exact") return "内容完全一致";
    if (candidate.verification === "different") return "最新内容不一致";
    if (candidate.verification === "rate-limited") return "GitHub 请求受限";
    if (candidate.verification === "auth-required") return "需要 GitHub Token";
    if (candidate.verification === "not-found") return "仓库不可访问";
    if (candidate.verification === "path-not-found") return "技能路径不存在";
    if (candidate.verification === "network-error") return "网络暂时不可用";
    if (candidate.verification === "too-large") return "远端目录过大";
    return "内容未验证";
  };
  const verificationHelp = (candidate: LocalSkillMatch) => {
    if (candidate.verification === "exact") return "远端目录与本地内容完全一致，可以直接匹配。";
    if (candidate.verification === "different") return "已读取远端内容，但与本地目录不同；匹配不会替换本地文件。";
    if (candidate.verification === "rate-limited") return "GitHub 请求达到上限，请稍后重试或配置 GitHub Token。";
    if (candidate.verification === "auth-required") return "当前仓库需要有效的 GitHub Token 才能验证。";
    if (candidate.verification === "not-found") return "仓库不存在，或当前账号无权访问。";
    if (candidate.verification === "path-not-found") return "仓库中没有找到该技能对应的 SKILL.md。";
    if (candidate.verification === "network-error") return "网络或代理异常，暂时无法读取远端内容。";
    if (candidate.verification === "too-large") return "远端目录超出安全读取限制。";
    return "暂时无法完成远端内容验证。";
  };
  const rateLimited = candidates.some(
    (candidate) => candidate.verification === "rate-limited",
  );

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div
          aria-busy="true"
          className="flex items-center gap-3 text-sm text-muted-foreground"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          正在查询远端技能…
        </div>
      ) : error ? (
        <p className="text-sm leading-6 text-destructive-text" role="alert">
          {error}
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          未找到名称完全匹配的远端技能。
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">候选来源</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {candidates.length} 个
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="查看匹配说明"
                    className="size-7"
                    size="icon"
                    variant="ghost"
                  >
                    <Info aria-hidden="true" className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs leading-5" sideOffset={6}>
                  匹配只会更新来源记录，不会替换本地文件。只有内容完全一致的候选才会记录远端版本；内容不一致的候选仍可匹配，但会标记为未验证。
                </TooltipContent>
              </Tooltip>
            </div>
            {showSearchMore ? (
              <Button onClick={onSearchMore} size="sm" variant="ghost">
                <Search data-icon="inline-start" />
                搜索更多
              </Button>
            ) : null}
          </div>
          {rateLimited ? (
            <p
              className="flex items-center gap-2 text-xs leading-5 text-destructive-text"
              role="status"
            >
              <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
              GitHub 请求受限；稍后重试或在设置中配置 Token。
            </p>
          ) : null}
          <div className="flex flex-col gap-2" role="list">
            {candidates.map((candidate) => {
              const canLink = ["exact", "different"].includes(
                candidate.verification,
              );
              const recommended =
                candidate.verification === "exact" &&
                candidate.id === exactCandidate?.id;
              return (
                <div
                  className={`flex items-start justify-between gap-4 rounded-md border p-3 ${
                    recommended
                      ? "border-success/30 bg-success/5"
                      : "border-border"
                  }`}
                  key={candidate.id}
                  role="listitem"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {candidate.name}
                      </p>
                      {recommended ? (
                        <Badge variant="success">推荐</Badge>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            tabIndex={0}
                            variant={
                              candidate.verification === "exact"
                                ? "success"
                                : candidate.verification === "different"
                                  ? "muted"
                                  : "outline"
                            }
                          >
                            {verificationLabel(candidate)}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent
                          className="max-w-xs leading-5"
                          sideOffset={6}
                        >
                          {verificationHelp(candidate)}
                        </TooltipContent>
                      </Tooltip>
                      {candidate.matchBasis === "npx-lock" ? (
                        <Badge variant="outline">NPX 记录</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      {candidate.source} · {candidate.slug}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
                      {candidate.installs > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Download aria-hidden="true" className="size-3.5" />
                          {candidate.installs.toLocaleString("zh-CN")}
                        </span>
                      ) : null}
                      {candidate.remoteVersion ? (
                        <span
                          className="inline-flex items-center gap-1.5"
                          title={`远端提交 ${candidate.remoteVersion}`}
                        >
                          <GitCommit aria-hidden="true" className="size-3.5" />
                          {shortRevision(candidate.remoteVersion)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    disabled={pending || !canLink}
                    onClick={() => onLink(candidate)}
                    size="sm"
                    variant={recommended ? "default" : "outline"}
                  >
                    <Link2 data-icon="inline-start" />
                    {canLink ? (recommended ? "采用" : "匹配") : "不可匹配"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DistributionStatus({
  distributed,
  label,
}: {
  distributed: boolean;
  label: string;
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 ${
        distributed ? "font-medium text-success-text" : "text-muted-foreground"
      }`}
      title={`${label}${distributed ? "已分发" : "未分发"}`}
    >
      {distributed ? (
        <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <Circle aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      {/* A `<span>` has no nameable role, so an aria-label here would be
          discarded. The state has to be real text to reach a screen reader. */}
      <span className="sr-only">{distributed ? "已分发" : "未分发"}</span>
    </span>
  );
}

function SkillRow({
  checking,
  checked,
  description,
  interactionDisabled,
  onCheck,
  onCheckUpdate,
  onToolDistribution,
  onDetail,
  onOnlineMatch,
  onOpenDirectory,
  onUninstall,
  onUpdate,
  pending,
  distributionPending,
  detectedTools,
  skill,
  tools,
  updating,
  updateAvailable,
}: {
  checking: boolean;
  checked: boolean;
  description?: string;
  interactionDisabled: boolean;
  onCheck: (checked: boolean) => void;
  onCheckUpdate: (skill: InstalledSkill) => void;
  onToolDistribution: (
    skill: InstalledSkill,
    toolId: string,
    distributed: boolean,
  ) => void;
  onDetail: (skill: InstalledSkill) => void;
  onOnlineMatch: (skill: InstalledSkill) => void;
  onOpenDirectory: (skill: InstalledSkill) => void;
  onUninstall: (skill: InstalledSkill) => void;
  onUpdate: (skill: InstalledSkill) => void;
  pending: boolean;
  distributionPending: boolean;
  detectedTools: string[];
  skill: InstalledSkill;
  tools: ToolOption[];
  updating: boolean;
  updateAvailable: boolean;
}) {
  const busy = pending || checking;
  const rowBusy = checking || (pending && !distributionPending);
  const controlsDisabled = busy || interactionDisabled;
  const hasRemoteUpdateSource = isRemoteUpdateable(skill);
  // Only tools installed on this machine, plus any that already hold a link for
  // this skill. Showing all ~19 registered tools per row would bury the two or
  // three that matter.
  const visibleTools = distributionTargetsFor(tools, detectedTools, skill);

  return (
    <div aria-busy={busy} className="relative">
      <div
        className={`grid gap-4 border-b border-border px-5 py-4 last:border-b-0 transition-[filter,opacity] duration-200 lg:grid-cols-[auto_minmax(0,1fr)_180px_150px_auto] lg:items-center ${
          rowBusy ? "pointer-events-none select-none blur-[2px] opacity-60" : ""
        }`}
      >
        <Checkbox
          aria-label={`选择 ${skill.name}`}
          checked={checked}
          disabled={controlsDisabled}
          onCheckedChange={(value) => onCheck(value === true)}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">
              {skill.name}
            </h3>
            <Badge variant="muted">{skill.owner}</Badge>
            {updateAvailable ? <Badge variant="success">有更新</Badge> : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {description || "暂无描述"}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
          <p>{sourceLabel(skill.source)}</p>
          <p>安装于 {formatInstalledAt(skill.installedAt)}</p>
        </div>
        <div aria-label="分发状态" className="flex min-w-0 flex-col gap-1 text-xs" role="group">
          {distributionPending ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
              分发中
            </span>
          ) : visibleTools.length === 0 ? (
            // No installed tool needs its own copy, so there is nothing to
            // distribute. Saying so beats an empty column.
            <span className="text-muted-foreground">无需分发</span>
          ) : (
            visibleTools.map((tool) => (
              <DistributionStatus
                distributed={skill.distributedTo.includes(tool.id)}
                key={tool.id}
                label={tool.label}
              />
            ))
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`打开 ${skill.name} 操作菜单`}
              disabled={controlsDisabled}
              size="icon"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={controlsDisabled}
                onSelect={() => onDetail(skill)}
              >
                <FileText />
                查看技能详情
              </DropdownMenuItem>
              {skill.source.startsWith("local://") ? (
                <DropdownMenuItem
                  disabled={controlsDisabled}
                  onSelect={() => onOnlineMatch(skill)}
                >
                  <Search />
                  在线匹配
                </DropdownMenuItem>
              ) : null}
              {hasRemoteUpdateSource ? (
                <DropdownMenuItem
                  disabled={controlsDisabled}
                  onSelect={() => onCheckUpdate(skill)}
                >
                  <RefreshCw />
                  检查更新
                </DropdownMenuItem>
              ) : null}
              {hasRemoteUpdateSource && updateAvailable ? (
                <DropdownMenuItem
                  disabled={controlsDisabled}
                  onSelect={() => onUpdate(skill)}
                >
                  <Download />
                  更新
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                disabled={controlsDisabled}
                onSelect={() => onOpenDirectory(skill)}
              >
                <FolderOpen />
                打开此技能文件夹
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Share2 />
                  分发到工具
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {visibleTools.length === 0 ? (
                    <DropdownMenuItem disabled>
                      没有需要分发的工具
                    </DropdownMenuItem>
                  ) : (
                    visibleTools.map((tool) => (
                      <DropdownMenuCheckboxItem
                        checked={skill.distributedTo.includes(tool.id)}
                        disabled={controlsDisabled}
                        key={tool.id}
                        onCheckedChange={(checked) =>
                          onToolDistribution(skill, tool.id, checked === true)
                        }
                        onSelect={(event) => event.preventDefault()}
                      >
                        {tool.label}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                disabled={controlsDisabled}
                onSelect={() => onUninstall(skill)}
                variant="destructive"
              >
                <Trash2 />
                卸载
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {rowBusy ? (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 bg-card/45 text-xs font-medium text-muted-foreground"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {checking ? "检查更新中" : updating ? "更新中" : "处理中"}
        </div>
      ) : null}
    </div>
  );
}

export function SkillsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    error: skillsError,
    detectedTools,
    loading: skillsLoading,
    skillsRoot,
    refresh: refreshSkills,
    skills,
    tools,
    updateSkill: updateInstalledSkill,
  } = useInstalledSkills();
  const {
    check: checkUpdatesNow,
    checking: updatesChecking,
    checkingIds: updateCheckingIds,
    error: updatesError,
    updates,
  } = useSkillUpdates();
  const refreshPage = useCallback(() => {
    // Clear the open-directory error so it cannot permanently mask a later
    // refresh failure behind a stale message.
    setDirectoryError(undefined);
    void refreshSkills();
  }, [refreshSkills]);
  const rescanSkills = useCallback(() => {
    void refreshSkills();
  }, [refreshSkills]);
  const management = useSkillManagement(refreshPage);
  const { save: saveTranslation, translations } =
    useSkillDescriptionTranslations();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<SkillSourceFilter>("all");
  const [status, setStatus] = useState<SkillStatusFilter>("all");
  const [sort, setSort] = useState<SkillSortMode>("recent");
  const [direction, setDirection] = useState<SkillSortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailSkill, setDetailSkill] = useState<InstalledSkill>();
  const [localDescriptionModes, setLocalDescriptionModes] = useState<
    Record<string, DescriptionMode>
  >({});
  const [localTranslationLoadingSkillId, setLocalTranslationLoadingSkillId] =
    useState<string>();
  const [localTranslationErrors, setLocalTranslationErrors] = useState<
    Record<string, string>
  >({});
  const [matchSkill, setMatchSkill] = useState<InstalledSkill>();
  const [matchCandidates, setMatchCandidates] = useState<LocalSkillMatch[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchExhaustive, setMatchExhaustive] = useState(false);
  const [matchError, setMatchError] = useState<string>();
  const matchRequestId = useRef(0);
  const [uninstallTarget, setUninstallTarget] = useState<InstalledSkill>();
  const [githubUrlOpen, setGithubUrlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [directoryError, setDirectoryError] = useState<string>();
  /** Progress for whichever batch action is running, so the action bar can
   * report it and every batch button can lock consistently. */
  const [bulkAction, setBulkAction] = useState<{
    kind: "update" | "distribute" | "uninstall";
    completed: number;
    total: number;
  }>();
  const [bulkUninstallOpen, setBulkUninstallOpen] = useState(false);
  const bulkWorking = bulkAction !== undefined;
  const [completedUpdateIds, setCompletedUpdateIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    // Selection is general-purpose: it drives check-updates, batch distribute,
    // and batch uninstall, so it tracks every installed skill. Each action
    // narrows it to the subset it can actually operate on instead (see
    // `selectedUpdateable`), which is what keeps "check updates" from ever
    // dragging a local skill into a remote check.
    const availableIds = new Set(skills.map((skill) => skill.id));
    setSelectedIds((current) => {
      // Return the same array when nothing was dropped so this does not force
      // a re-render on every skills refresh.
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [skills]);

  const visibleUpdates = useMemo(
    () => updates.filter((item) => !completedUpdateIds.has(item.id)),
    [completedUpdateIds, updates],
  );
  const updatesById = useMemo(
    () => new Map(visibleUpdates.map((item) => [item.id, item])),
    [visibleUpdates],
  );
  const availableUpdateCount = visibleUpdates.filter(
    (item) => item.updateAvailable,
  ).length;
  const filteredSkills = useMemo(
    () =>
      filterAndSortSkills(skills, updatesById, {
        direction,
        search,
        sort,
        source,
        status,
      }),
    [direction, search, skills, sort, source, status, updatesById],
  );

  const groups = useMemo(() => {
    return groupByAuthor(filteredSkills);
  }, [filteredSkills]);

  // Controlled open state. `defaultValue` is read only on mount, so author
  // groups revealed later by a search or refresh would render collapsed even
  // though every group is meant to start open. Only owners that have not been
  // offered yet are auto-opened, so a group the user collapses by hand stays
  // collapsed across filter changes.
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const seenGroupOwners = useRef<Set<string>>(new Set());
  useEffect(() => {
    const unseen = groups
      .map(([owner]) => owner)
      .filter((owner) => !seenGroupOwners.current.has(owner));
    if (unseen.length === 0) return;
    unseen.forEach((owner) => seenGroupOwners.current.add(owner));
    setOpenGroups((current) => [...new Set([...current, ...unseen])]);
  }, [groups]);

  // Build the id list and the membership set once per filter change. The
  // previous version ran `selectedIds.includes(...)` inside both an `every`
  // and a `filter` over every visible row, making selection state O(n*m) and
  // re-running on every render.
  const filteredIds = useMemo(
    () => filteredSkills.map((skill) => skill.id),
    [filteredSkills],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredIdSet = useMemo(() => new Set(filteredIds), [filteredIds]);
  const updateCheckingIdSet = useMemo(
    () => new Set(updateCheckingIds),
    [updateCheckingIds],
  );
  const selectedFilteredCount = useMemo(
    () => filteredIds.reduce((count, id) => count + (selectedIdSet.has(id) ? 1 : 0), 0),
    [filteredIds, selectedIdSet],
  );
  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const filteredSelectionState = allFilteredSelected
    ? true
    : selectedFilteredCount > 0
      ? "indeterminate"
      : false;
  // The selected skills, and the per-action subsets each batch action can
  // actually operate on. Keeping the subsets separate is what lets selection
  // stay general-purpose without an action silently over-reaching.
  const selectedSkills = useMemo(
    () => skills.filter((skill) => selectedIdSet.has(skill.id)),
    [selectedIdSet, skills],
  );
  const selectedUpdateable = useMemo(
    () => selectedSkills.filter(isRemoteUpdateable),
    [selectedSkills],
  );
  // Per-tool counts of selected skills that still need a link. Only tools
  // installed on this machine are counted, so a batch action shows the real
  // number for the tools that matter rather than all ~19 registered ones.
  const detectedToolList = useMemo(
    () => tools.filter((tool) => detectedTools.includes(tool.id)),
    [detectedTools, tools],
  );
  const selectedMissingByTool = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of detectedToolList) {
      counts.set(
        tool.id,
        selectedSkills.filter((skill) => !skill.distributedTo.includes(tool.id))
          .length,
      );
    }
    return counts;
  }, [detectedToolList, selectedSkills]);
  // Facet counts come from the search-only set, so a chip's number answers
  // "how many matches are in this group" instead of collapsing to the count of
  // whichever facet is currently active.
  const searchedSkills = useMemo(
    () => searchSkills(skills, search),
    [search, skills],
  );
  const sourceCounts = useMemo(
    () => countSkillsBySource(searchedSkills),
    [searchedSkills],
  );
  const statusCounts = useMemo(
    () => countSkillsByStatus(searchedSkills, updatesById),
    [searchedSkills, updatesById],
  );
  const activeFilterCount =
    (source === "all" ? 0 : 1) +
    (status === "all" ? 0 : 1) +
    (search.trim() ? 1 : 0);
  const resetFilters = useCallback(() => {
    setSearch("");
    setSource("all");
    setStatus("all");
  }, []);
  const pageError =
    directoryError ?? skillsError ?? updatesError ?? management.error;
  const openDirectory = async (skill: InstalledSkill) => {
    setDirectoryError(undefined);
    try {
      await openSkillDirectory(skill.id);
    } catch (error) {
      setDirectoryError(normalizeTauriError(error));
    }
  };
  const confirmUninstall = async () => {
    if (!uninstallTarget) return;
    await management.uninstall(uninstallTarget.id);
    setUninstallTarget(undefined);
  };
  const checkSelectedUpdates = async () => {
    const ids = selectedUpdateable.map((skill) => skill.id);
    if (ids.length === 0) return;
    setCompletedUpdateIds(new Set());
    const result = await checkUpdatesNow(undefined, ids);
    if (result === undefined) {
      toast({
        description: "请稍后重试。",
        title: "检查更新失败",
        variant: "error",
      });
      return;
    }
    const updateCount = result.filter((item) => item.updateAvailable).length;
    // Say how many were actually checked: the selection can include local
    // skills that this action deliberately skips.
    const skipped = selectedSkills.length - ids.length;
    const skippedNote =
      skipped > 0 ? `已跳过 ${skipped} 个没有远端来源的技能。` : "";
    toast({
      description:
        updateCount > 0
          ? `发现 ${updateCount} 个技能有更新。${skippedNote}`
          : `已检查 ${ids.length} 个技能，均为最新。${skippedNote}`,
      title: updateCount > 0 ? "发现可用更新" : "检查完成",
      variant: updateCount > 0 ? "info" : "success",
    });
  };
  /** Checks every installed remote skill, independent of the selection. */
  const checkAllUpdates = async () => {
    setCompletedUpdateIds(new Set());
    const result = await checkUpdatesNow();
    if (result === undefined) {
      toast({
        description: "请稍后重试。",
        title: "检查更新失败",
        variant: "error",
      });
      return;
    }
    const updateCount = result.filter((item) => item.updateAvailable).length;
    toast({
      description:
        updateCount > 0
          ? `发现 ${updateCount} 个技能有更新。`
          : `已检查 ${result.length} 个远端技能，均为最新。`,
      title: updateCount > 0 ? "发现可用更新" : "检查完成",
      variant: updateCount > 0 ? "info" : "success",
    });
  };
  const checkSingleUpdate = async (skill: InstalledSkill) => {
    setCompletedUpdateIds((current) => {
      if (!current.has(skill.id)) return current;
      const next = new Set(current);
      next.delete(skill.id);
      return next;
    });
    const result = await checkUpdatesNow(skill.id);
    if (result === undefined) {
      toast({
        description: "请稍后重试。",
        title: "检查更新失败",
        variant: "error",
      });
      return;
    }
    const update = result.find((item) => item.id === skill.id);
    toast({
      description: update?.updateAvailable
        ? "发现新版本，可以从技能菜单中更新。"
        : update
          ? "当前已是最新版本。"
          : "已完成当前技能的更新检查。",
      title: update?.updateAvailable ? "发现可用更新" : "检查完成",
      variant: update?.updateAvailable ? "info" : "success",
    });
  };
  /**
   * Adds or removes one tool's link for one skill. The backend returns the
   * record with `distributedTo` recomputed from disk, so the local cache is
   * replaced rather than patched with a guess.
   */
  const toggleToolDistribution = async (
    skill: InstalledSkill,
    toolId: string,
    distributed: boolean,
  ) => {
    const updated = await management.setToolDistribution(
      skill.id,
      toolId,
      distributed,
      { refresh: false },
    );
    if (updated) {
      updateInstalledSkill({ ...skill, ...updated });
    }
  };
  const updateSingleSkill = async (skill: InstalledSkill) => {
    const result = await management.update(skill.id);
    if (result) {
      setCompletedUpdateIds((current) => new Set(current).add(skill.id));
    }
  };
  /**
   * Batch distribution runs the existing per-skill pipeline sequentially and
   * continues past individual failures, mirroring the batch-update flow. Only
   * skills that actually need the link are targeted, so a second click is a
   * no-op instead of a re-link of everything.
   */
  const distributeSelected = async (toolId: string, enable: boolean) => {
    if (bulkWorking) return;
    const tool = tools.find((entry) => entry.id === toolId);
    const targets = selectedSkills.filter(
      (skill) => skill.distributedTo.includes(toolId) !== enable,
    );
    if (targets.length === 0) return;

    const label = tool?.label ?? toolId;
    setBulkAction({ kind: "distribute", completed: 0, total: targets.length });
    let doneCount = 0;
    let failedCount = 0;
    try {
      for (const skill of targets) {
        const updated = await management.setToolDistribution(
          skill.id,
          toolId,
          enable,
          { refresh: false },
        );
        if (updated) {
          doneCount += 1;
          updateInstalledSkill({ ...skill, ...updated });
        } else {
          failedCount += 1;
        }
        setBulkAction((current) =>
          current ? { ...current, completed: current.completed + 1 } : current,
        );
      }
      await refreshSkills();
    } finally {
      setBulkAction(undefined);
    }
    toast({
      description:
        failedCount > 0
          ? `已为 ${doneCount} 个技能${enable ? "添加" : "移除"} ${label} 链接，${failedCount} 个失败。`
          : `已为 ${doneCount} 个技能${enable ? "添加" : "移除"} ${label} 链接。`,
      title: failedCount > 0 ? "批量分发部分完成" : "批量分发完成",
      variant: failedCount > 0 ? "warning" : "success",
    });
  };
  const confirmBulkUninstall = async () => {
    if (bulkWorking || selectedSkills.length === 0) return;
    const targets = [...selectedSkills];
    setBulkAction({ kind: "uninstall", completed: 0, total: targets.length });
    let doneCount = 0;
    let failedCount = 0;
    try {
      for (const skill of targets) {
        const result = await management.uninstall(skill.id);
        if (result === undefined) {
          failedCount += 1;
        } else {
          doneCount += 1;
        }
        setBulkAction((current) =>
          current ? { ...current, completed: current.completed + 1 } : current,
        );
      }
      setSelectedIds([]);
      await refreshSkills();
    } finally {
      setBulkAction(undefined);
      setBulkUninstallOpen(false);
    }
    toast({
      description:
        failedCount > 0
          ? `已卸载 ${doneCount} 个技能，${failedCount} 个失败。`
          : `已卸载 ${doneCount} 个技能。`,
      title: failedCount > 0 ? "批量卸载部分完成" : "批量卸载完成",
      variant: failedCount > 0 ? "warning" : "success",
    });
  };
  const updateAllSkills = async () => {
    if (bulkWorking) return;
    const targets = updates.filter(
      (item) => item.updateAvailable && !completedUpdateIds.has(item.id),
    );
    if (targets.length === 0) return;

    setBulkAction({ kind: "update", completed: 0, total: targets.length });
    let updatedCount = 0;
    let failedCount = 0;
    try {
      for (const target of targets) {
        const result = await management.update(target.id, { refresh: false });
        if (result) {
          updatedCount += 1;
          setCompletedUpdateIds((current) => new Set(current).add(target.id));
        } else {
          failedCount += 1;
        }
        setBulkAction((current) =>
          current ? { ...current, completed: current.completed + 1 } : current,
        );
      }
      await refreshSkills();
    } finally {
      setBulkAction(undefined);
    }
    toast({
      description:
        failedCount > 0
          ? `已更新 ${updatedCount} 个技能，${failedCount} 个技能更新失败。`
          : `已更新 ${updatedCount} 个技能。`,
      title: failedCount > 0 ? "批量更新完成" : "全部更新完成",
      variant: failedCount > 0 ? "info" : "success",
    });
  };
  const closeOnlineMatch = () => {
    matchRequestId.current += 1;
    setMatchSkill(undefined);
    setMatchCandidates([]);
    setMatchError(undefined);
    setMatchExhaustive(false);
  };
  const loadOnlineMatches = async (
    skill: InstalledSkill,
    exhaustive: boolean,
  ) => {
    const requestId = ++matchRequestId.current;
    if (!exhaustive) {
      setMatchSkill(skill);
      setMatchCandidates([]);
    }
    setMatchError(undefined);
    setMatchLoading(true);
    try {
      const result = await searchLocalSkillMatches(skill.id, exhaustive);
      if (requestId === matchRequestId.current) {
        setMatchCandidates(result);
        setMatchExhaustive(exhaustive);
      }
    } catch (reason) {
      if (requestId === matchRequestId.current) {
        setMatchError(normalizeTauriError(reason));
      }
    } finally {
      if (requestId === matchRequestId.current) setMatchLoading(false);
    }
  };
  const openOnlineMatch = (skill: InstalledSkill) => {
    void loadOnlineMatches(skill, false);
  };
  const confirmOnlineMatch = async (candidate: LocalSkillMatch) => {
    if (!matchSkill) return;
    const result = await management.linkLocalSkill(
      matchSkill.id,
      candidate.id,
      candidate.remoteVersion,
    );
    if (result) closeOnlineMatch();
  };
  const openRootDirectory = async () => {
    if (!skillsRoot) return;
    setDirectoryError(undefined);
    try {
      await openSkillsRoot(skillsRoot);
    } catch (error) {
      setDirectoryError(normalizeTauriError(error));
    }
  };
  const translateLocalDescription = async () => {
    const skill = detailSkill;
    if (!skill) return;
    const cachedTranslation = translations[skill.id];
    if (cachedTranslation) {
      setLocalDescriptionModes((current) => ({
        ...current,
        [skill.id]: "translated",
      }));
      return;
    }

    setLocalTranslationLoadingSkillId(skill.id);
    setLocalTranslationErrors((current) => {
      if (!current[skill.id]) return current;
      const next = { ...current };
      delete next[skill.id];
      return next;
    });
    try {
      const translated = await translateSkillDescription(skill.description);
      await saveTranslation(skill.id, translated);
      setLocalDescriptionModes((current) => ({
        ...current,
        [skill.id]: "translated",
      }));
    } catch (reason) {
      setLocalTranslationErrors((current) => ({
        ...current,
        [skill.id]: normalizeTauriError(reason),
      }));
    } finally {
      setLocalTranslationLoadingSkillId((current) =>
        current === skill.id ? undefined : current,
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The page name lives in the title bar, so this surface starts straight
          into its toolbar. Only the real actions are portalled up. */}
      <PageActions>
        <Button
          disabled={
            skillsLoading ||
            updatesChecking ||
            bulkWorking ||
            Boolean(management.pending)
          }
          onClick={rescanSkills}
          size="xs"
          variant="outline"
        >
          <ScanSearch data-icon="inline-start" />
          重新扫描
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs">
              <SquareArrowRightEnter data-icon="inline-start" />
              手动导入
              <ChevronDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                <FolderOpen />
                导入本地技能
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setGithubUrlOpen(true)}>
                <GitBranch />
                GitHub 链接安装
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageActions>

      <ErrorBanner
        className="mb-4"
        error={pageError}
        onOpenSettings={() => navigate("/settings")}
        onRetry={refreshPage}
      />

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="flex shrink-0 flex-col gap-4 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-56 flex-1 basis-56">
                <label className="sr-only" htmlFor="installed-skill-search">
                  搜索已安装技能
                </label>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="pl-9 pr-11"
                  id="installed-skill-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索技能、作者或描述"
                  value={search}
                />
                {search ? (
                  <Button
                    aria-label="清除技能搜索"
                    className="absolute right-0 top-1/2 size-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearch("")}
                    title="清除技能搜索"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <Select
                  onValueChange={(value) => setSort(value as SkillSortMode)}
                  value={sort}
                >
                  <SelectTrigger aria-label="排序方式" className="w-36">
                    <SelectValue placeholder="排序" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="recent">最近安装</SelectItem>
                      <SelectItem value="name">技能名称</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {/* Direction is its own control so neither order needs an
                    inverse twin in the list above. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={
                        direction === "desc" ? "改为升序排列" : "改为降序排列"
                      }
                      onClick={() =>
                        setDirection((current) =>
                          current === "desc" ? "asc" : "desc",
                        )
                      }
                      size="icon"
                      variant="outline"
                    >
                      {direction === "desc" ? (
                        <ArrowDownWideNarrow aria-hidden="true" />
                      ) : (
                        <ArrowUpNarrowWide aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>
                    {direction === "desc"
                      ? sort === "recent"
                        ? "最新安装在前"
                        : "技能名称从后往前"
                      : sort === "recent"
                        ? "最早安装在前"
                        : "技能名称从前往后"}
                  </TooltipContent>
                </Tooltip>
              </div>
              {activeFilterCount > 0 ? (
                <Button
                  onClick={resetFilters}
                  size="sm"
                  variant="ghost"
                >
                  <X data-icon="inline-start" />
                  清除筛选（{activeFilterCount}）
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-8 shrink-0 text-xs text-foreground/70">
                  来源
                </span>
                <ToggleGroup
                  aria-label="按来源筛选"
                  onValueChange={(value) =>
                    setSource((value || "all") as SkillSourceFilter)
                  }
                  size="sm"
                  type="single"
                  value={source}
                >
                  {SOURCE_FILTERS.map(({ label, value }) => (
                    <ToggleGroupItem
                      aria-label={`${label}（${sourceCounts[value]}）`}
                      disabled={value !== "all" && sourceCounts[value] === 0}
                      key={value}
                      value={value}
                    >
                      {label}
                      {/* Inherits the chip's own foreground at reduced opacity
                          rather than the muted token: muted-on-chip measures
                          ~3.5:1, below the 4.5:1 floor for text this size. */}
                      <span className="tabular-nums opacity-80">
                        {sourceCounts[value]}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-8 shrink-0 text-xs text-foreground/70">
                  状态
                </span>
                <ToggleGroup
                  aria-label="按更新状态筛选"
                  onValueChange={(value) =>
                    setStatus((value || "all") as SkillStatusFilter)
                  }
                  size="sm"
                  type="single"
                  value={status}
                >
                  {STATUS_FILTERS.map(({ label, value }) => (
                    <ToggleGroupItem
                      aria-label={`${label}（${statusCounts[value]}）`}
                      disabled={value !== "all" && statusCounts[value] === 0}
                      key={value}
                      value={value}
                    >
                      {label}
                      <span className="tabular-nums opacity-80">
                        {statusCounts[value]}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {statusCounts["no-source"] > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        aria-label="说明：为什么本地技能没有更新状态"
                        className="inline-flex cursor-help items-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        role="img"
                        tabIndex={0}
                      >
                        <Info aria-hidden="true" className="size-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs leading-5" sideOffset={6}>
                      本地导入和内置技能没有远端来源，无法检查更新，因此单独归为“无更新源”。
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filteredSelectionState}
                  disabled={filteredIds.length === 0}
                  id="select-filtered"
                  onCheckedChange={(checked) =>
                    setSelectedIds((current) =>
                      checked === true
                        ? [...new Set([...current, ...filteredIds])]
                        : current.filter((id) => !filteredIdSet.has(id)),
                    )
                  }
                />
                <Label
                  className="font-normal text-foreground/70"
                  htmlFor="select-filtered"
                >
                  {filteredIds.length > 0
                    ? `全选 ${filteredIds.length} 个`
                    : "没有可选的技能"}
                </Label>
              </div>
              {/* The toolbar swaps to selection actions once anything is
                  picked. This is what gives "select all" a purpose: the
                  selection drives distribution and uninstall, not only the
                  update check. Each button carries its own count, so no
                  separate "N selected" readout is needed. */}
              {selectedSkills.length > 0 ? (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        disabled={bulkWorking || Boolean(management.pending)}
                        size="sm"
                        variant="outline"
                      >
                        <Share2 data-icon="inline-start" />
                        批量分发
                        <ChevronDown data-icon="inline-end" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      <DropdownMenuLabel>
                        为选中的技能管理工具链接
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {detectedToolList.length === 0 ? (
                        <DropdownMenuItem disabled>
                          没有需要分发的工具
                        </DropdownMenuItem>
                      ) : (
                        detectedToolList.map((tool, index) => {
                          const missing =
                            selectedMissingByTool.get(tool.id) ?? 0;
                          const linked = selectedSkills.length - missing;
                          return (
                            <Fragment key={tool.id}>
                              {index > 0 ? <DropdownMenuSeparator /> : null}
                              <DropdownMenuItem
                                disabled={missing === 0}
                                onSelect={() =>
                                  void distributeSelected(tool.id, true)
                                }
                              >
                                <CheckCircle2 />
                                添加到 {tool.label}
                                {missing > 0 ? (
                                  <DropdownMenuShortcut>
                                    {missing}
                                  </DropdownMenuShortcut>
                                ) : null}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={linked === 0}
                                onSelect={() =>
                                  void distributeSelected(tool.id, false)
                                }
                              >
                                <MinusCircle />
                                从 {tool.label} 移除
                              </DropdownMenuItem>
                            </Fragment>
                          );
                        })
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          disabled={
                            selectedUpdateable.length === 0 ||
                            updatesChecking ||
                            bulkWorking
                          }
                          onClick={() => void checkSelectedUpdates()}
                          size="sm"
                          variant="secondary"
                        >
                          <RefreshCw data-icon="inline-start" />
                          {updatesChecking
                            ? "检查中"
                            : `检查更新（${selectedUpdateable.length}）`}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      className="max-w-xs leading-5"
                      sideOffset={6}
                    >
                      {selectedUpdateable.length > 0
                        ? `检查选中的 ${selectedUpdateable.length} 个远端技能`
                        : "选中的技能都没有远端来源，无法检查更新"}
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    disabled={bulkWorking || Boolean(management.pending)}
                    onClick={() => setBulkUninstallOpen(true)}
                    size="sm"
                    variant="destructive"
                  >
                    <Trash2 data-icon="inline-start" />
                    卸载（{selectedSkills.length}）
                  </Button>
                </div>
              ) : (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          aria-label="打开共享技能目录"
                          disabled={!skillsRoot || skillsLoading}
                          onClick={() => void openRootDirectory()}
                          size="sm"
                          variant="ghost"
                        >
                          <FolderOpen data-icon="inline-start" />
                          打开共享目录
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm leading-5" sideOffset={6}>
                      所有技能都装在这里：
                      <span className="mt-1 block font-mono text-xs">
                        {skillsRoot ?? "加载中…"}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                  {availableUpdateCount > 0 || bulkAction ? (
                    <Button
                      aria-label={`更新全部 ${availableUpdateCount} 个技能`}
                      disabled={
                        bulkWorking ||
                        updatesChecking ||
                        Boolean(management.pending)
                      }
                      onClick={() => void updateAllSkills()}
                      size="sm"
                      title={`更新全部 ${availableUpdateCount} 个技能`}
                    >
                      {bulkAction?.kind === "update" ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <Download data-icon="inline-start" />
                      )}
                      {bulkAction?.kind === "update"
                        ? `更新中 ${bulkAction.completed}/${bulkAction.total}`
                        : `更新全部（${availableUpdateCount}）`}
                    </Button>
                  ) : null}
                  <Button
                    disabled={skillsLoading || updatesChecking || bulkWorking}
                    onClick={() => void checkAllUpdates()}
                    size="sm"
                    variant="secondary"
                  >
                    <RefreshCw data-icon="inline-start" />
                    {updatesChecking ? "检查中" : "检查全部更新"}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <Separator className="shrink-0 bg-foreground/20" />
          {/* The list owns the scrolling. Page chrome (header, filters,
              action bar) stays fixed, so a long library never pushes it
              off-screen or adds a second scrollbar. */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
            {skillsLoading ? (
              <SkillsLoadingState />
            ) : skills.length === 0 ? (
              <EmptyState
                action={
                  <Button
                    onClick={() => navigate("/store")}
                    variant="secondary"
                  >
                    去技能商店
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                }
                description="安装技能后会显示在这里，可按作者查看。"
                icon={Library}
                title="还没有技能"
              />
            ) : groups.length === 0 ? (
              <EmptyState
                action={
                  activeFilterCount > 0 ? (
                    <Button onClick={resetFilters} variant="secondary">
                      清除筛选条件
                    </Button>
                  ) : undefined
                }
                description={
                  activeFilterCount > 0
                    ? "当前筛选条件下没有技能，清除筛选后可看到全部技能。"
                    : "换个搜索词或筛选条件试试。"
                }
                icon={Search}
                title="没有匹配的技能"
              />
            ) : (
              <Accordion
                className="flex flex-col gap-3"
                onValueChange={setOpenGroups}
                type="multiple"
                value={openGroups}
              >
                {groups.map(([owner, ownerSkills]) => (
                  <AccordionItem
                    className="last:border-b overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                    key={owner}
                    value={owner}
                  >
                    <AccordionTrigger className="rounded-none border-b border-border px-5 py-4 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">
                          {owner}
                        </span>
                        <Badge variant="muted">
                          {ownerSkills.length} 个技能
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <div>
                        {ownerSkills.map((skill) => (
                          <SkillRow
                            checking={updateCheckingIdSet.has(skill.id)}
                            checked={selectedIdSet.has(skill.id)}
                            description={
                              localDescriptionModes[skill.id] ===
                                "translated" ||
                              (localDescriptionModes[skill.id] === undefined &&
                                translations[skill.id])
                                ? translations[skill.id] ?? skill.description
                                : skill.description
                            }
                            detectedTools={detectedTools}
                            interactionDisabled={bulkWorking}
                            key={skill.id}
                            onCheck={(checked) =>
                              setSelectedIds((current) =>
                                checked
                                  ? [...new Set([...current, skill.id])]
                                  : current.filter((id) => id !== skill.id),
                              )
                            }
                            onCheckUpdate={(item) => void checkSingleUpdate(item)}
                            onDetail={setDetailSkill}
                            onOnlineMatch={(item) => void openOnlineMatch(item)}
                            onOpenDirectory={(item) => void openDirectory(item)}
                            onToolDistribution={(item, toolId, distributed) =>
                              void toggleToolDistribution(
                                item,
                                toolId,
                                distributed,
                              )
                            }
                            onUninstall={setUninstallTarget}
                            onUpdate={(item) => void updateSingleSkill(item)}
                            pending={management.pending === skill.id}
                            distributionPending={
                              management.pending === skill.id &&
                              management.pendingAction?.kind === "distribution"
                            }
                            skill={skill}
                            tools={tools}
                            updating={
                              management.pendingAction?.skillId === skill.id &&
                              management.pendingAction.kind === "update"
                            }
                            updateAvailable={
                              updatesById.get(skill.id)?.updateAvailable ??
                              false
                            }
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog
        contentClassName="px-6 py-4"
        description="为本地技能关联远端来源。"
        descriptionHidden
        onClose={closeOnlineMatch}
        open={Boolean(matchSkill)}
        title={`在线匹配：${matchSkill?.name ?? "技能"}`}
      >
        {matchSkill ? (
          <LocalMatchContent
            candidates={matchCandidates}
            error={matchError ?? management.error}
            loading={matchLoading}
            onLink={(candidate) => void confirmOnlineMatch(candidate)}
            onSearchMore={() => void loadOnlineMatches(matchSkill, true)}
            pending={Boolean(management.pending)}
            showSearchMore={
              !matchExhaustive &&
              matchCandidates.length > 0 &&
              !matchCandidates.some(
                (candidate) =>
                  candidate.verification === "exact" ||
                  candidate.matchBasis === "npx-lock",
              )
            }
          />
        ) : null}
      </Dialog>
      <Dialog
        description="查看本地已安装信息，可翻译技能说明。"
        onClose={() => setDetailSkill(undefined)}
        open={Boolean(detailSkill)}
        title={detailSkill?.name ?? "技能详情"}
      >
        {detailSkill ? (
          <SkillDetailContent
            descriptionMode={
              localDescriptionModes[detailSkill.id] ??
              (translations[detailSkill.id] ? "translated" : "original")
            }
            detectedTools={detectedTools}
            onDescriptionModeChange={(mode) =>
              setLocalDescriptionModes((current) => ({
                ...current,
                [detailSkill.id]: mode,
              }))
            }
            onTranslate={() => void translateLocalDescription()}
            skill={detailSkill}
            skillsRoot={skillsRoot}
            tools={tools}
            translatedDescription={
              translations[detailSkill.id]
            }
            translationError={localTranslationErrors[detailSkill.id]}
            translationLoading={
              localTranslationLoadingSkillId === detailSkill.id
            }
          />
        ) : null}
      </Dialog>
      <AlertDialog
        onOpenChange={(open) => !open && setUninstallTarget(undefined)}
        open={Boolean(uninstallTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认卸载</AlertDialogTitle>
            <AlertDialogDescription>
              会删除这个技能在共享目录中的文件夹和记录，所有读取该目录的 AI
              工具会立即失去这个技能，不影响其他技能。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            确定卸载“{uninstallTarget?.name}”？
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(management.pending)}
              onClick={() => void confirmUninstall()}
              variant="destructive"
            >
              {management.pending ? "卸载中" : "卸载"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => !open && setBulkUninstallOpen(false)}
        open={bulkUninstallOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              确认卸载 {selectedSkills.length} 个技能
            </AlertDialogTitle>
            <AlertDialogDescription>
              会删除这些技能在共享目录中的文件夹和记录，所有读取该目录的 AI
              工具会立即失去它们，不影响未选中的技能。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-hidden rounded-md border border-border bg-muted/40 p-3">
            <p className="font-mono text-xs leading-5 text-muted-foreground">
              {selectedSkills.map((skill) => skill.name).join("、")}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkWorking}
              onClick={() => void confirmBulkUninstall()}
              variant="destructive"
            >
              {bulkAction?.kind === "uninstall"
                ? `卸载中 ${bulkAction.completed}/${bulkAction.total}`
                : `卸载 ${selectedSkills.length} 个`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <GithubUrlInstallDialog
        onClose={() => setGithubUrlOpen(false)}
        onCompleted={refreshPage}
        onOpenSettings={() => navigate("/settings")}
        open={githubUrlOpen}
      />
      <ImportDialog
        onClose={() => setImportOpen(false)}
        onCompleted={refreshPage}
        open={importOpen}
      />
    </div>
  );
}
