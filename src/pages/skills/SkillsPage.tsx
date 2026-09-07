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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import {
  ArrowRight,
  Download,
  FileText,
  FolderOpen,
  GitBranch,
  Library,
  LoaderCircle,
  Link2,
  MoreHorizontal,
  RefreshCw,
  ScanSearch,
  Search,
  Store,
  Trash2,
  Unlink2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageHeader } from "../../components/common/PageHeader";
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
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Skeleton } from "../../components/ui/skeleton";
import { useToast } from "../../components/ui/toast-context";
import {
  openSkillDirectory,
  openSkillsRoot,
  searchLocalSkillMatches,
} from "../../features/skills/api";
import { translateSkillDescription } from "../../features/store/api";
import {
  useInstalledSkills,
  useSkillManagement,
  useSkillUpdates,
} from "../../features/skills/hooks";
import { useSkillDescriptionTranslations } from "../../features/store/hooks";
import type {
  InstalledSkill,
  LocalSkillMatch,
} from "../../features/skills/types";
import {
  filterAndSortSkills,
  groupByAuthor,
  sourceLabel,
  type SkillSortMode,
  type SkillSourceFilter,
  type SkillStatusFilter,
} from "../../features/skills/selectors";
import { normalizeTauriError } from "../../lib/tauri";

function shortRevision(revision: string) {
  return revision.length > 12 ? revision.slice(0, 8) : revision;
}

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
  skill,
  skillsRoot,
  onDescriptionModeChange,
  onTranslate,
  translatedDescription,
  translationError,
  translationLoading,
}: {
  descriptionMode: DescriptionMode;
  skill: InstalledSkill;
  skillsRoot?: string;
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
        <Badge variant={skill.claudeDistributed ? "success" : "muted"}>
          {skill.claudeDistributed ? "已分发至 Claude" : "未分发至 Claude"}
        </Badge>
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
  pending,
  skill,
}: {
  candidates: LocalSkillMatch[];
  error?: string;
  loading: boolean;
  onLink: (candidate: LocalSkillMatch) => void;
  pending: boolean;
  skill: InstalledSkill;
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
  const rateLimited = candidates.some(
    (candidate) => candidate.verification === "rate-limited",
  );
  const hasUnverifiedCandidate = candidates.some(
    (candidate) => !["exact", "different"].includes(candidate.verification),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md bg-muted/50 p-4">
        <p className="text-sm leading-6 text-muted-foreground">
          将为“{skill.name}”搜索名称匹配的远端技能。确认匹配后只更新来源记录，
          不会替换本地文件。
        </p>
      </div>
      {loading ? (
        <div
          aria-busy="true"
          className="flex items-center gap-3 text-sm text-muted-foreground"
        >
          <Search className="size-4 animate-pulse" />
          正在查询远端技能…
        </div>
      ) : error ? (
        <p className="text-sm leading-6 text-destructive" role="alert">
          {error}
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          未找到名称完全匹配的远端技能。
        </p>
      ) : (
        <div className="flex flex-col gap-3" role="list">
          <div
            className={`rounded-md border p-4 ${
              exactCandidate
                ? "border-success/30 bg-success/5"
                : "border-border bg-muted/50"
            }`}
          >
            <p className="text-sm font-medium text-foreground">
              {exactCandidate
                ? "已找到与本地目录内容完全一致的候选，已优先置顶。"
                : "未找到当前内容完全一致的候选，请根据作者和仓库来源确认。"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              名称相同不代表来源相同；“内容完全一致”只表示当前远端目录指纹一致。
            </p>
            {rateLimited ? (
              <p className="mt-2 text-xs leading-5 text-destructive">
                GitHub API
                已达到当前请求上限，验证已停止。请稍后重试，或在设置中配置
                GitHub Token。
              </p>
            ) : hasUnverifiedCandidate ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                未完成验证的候选不会允许直接绑定，请先处理网络、权限或路径问题。
              </p>
            ) : null}
          </div>
          <p className="text-sm font-medium text-foreground">
            找到 {candidates.length} 个候选
          </p>
          {candidates.map((candidate, index) => (
            <div
              className="flex items-start justify-between gap-4 rounded-md border border-border p-4"
              key={candidate.id}
              role="listitem"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {candidate.name}
                  </p>
                  {index === 0 ? (
                    <Badge
                      className="border-primary/30 text-primary"
                      variant="outline"
                    >
                      {exactCandidate ? "推荐" : "优先候选"}
                    </Badge>
                  ) : null}
                  <Badge
                    variant={
                      candidate.verification === "exact" ? "success" : "muted"
                    }
                  >
                    {verificationLabel(candidate)}
                  </Badge>
                </div>
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  仓库 {candidate.source} · 路径 {candidate.slug}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  安装量 {candidate.installs.toLocaleString("zh-CN")}
                  {candidate.remoteVersion
                    ? ` · 远端提交 ${shortRevision(candidate.remoteVersion)}`
                    : " · 暂无远端版本"}
                </p>
                {candidate.remoteHash ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    远端指纹 {candidate.remoteHash.slice(0, 12)}
                  </p>
                ) : null}
              </div>
              <Button
                disabled={
                  pending ||
                  !["exact", "different"].includes(candidate.verification)
                }
                onClick={() => onLink(candidate)}
                size="sm"
                variant="outline"
              >
                <Link2 data-icon="inline-start" />
                {!["exact", "different"].includes(candidate.verification)
                  ? "无法验证"
                  : index === 0 && exactCandidate
                    ? "采用推荐"
                    : "匹配"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillRow({
  checking,
  checked,
  description,
  onCheck,
  onClaudeDistribution,
  onDetail,
  onOnlineMatch,
  onOpenDirectory,
  onUninstall,
  onUpdate,
  pending,
  skill,
  updating,
  updateAvailable,
}: {
  checking: boolean;
  checked: boolean;
  description?: string;
  onCheck: (checked: boolean) => void;
  onClaudeDistribution: (skill: InstalledSkill) => void;
  onDetail: (skill: InstalledSkill) => void;
  onOnlineMatch: (skill: InstalledSkill) => void;
  onOpenDirectory: (skill: InstalledSkill) => void;
  onUninstall: (skill: InstalledSkill) => void;
  onUpdate: (skill: InstalledSkill) => void;
  pending: boolean;
  skill: InstalledSkill;
  updating: boolean;
  updateAvailable: boolean;
}) {
  const busy = pending || checking;

  return (
    <div aria-busy={busy} className="relative">
      <div
        className={`grid gap-4 border-b border-border px-5 py-4 last:border-b-0 transition-[filter,opacity] duration-200 lg:grid-cols-[auto_minmax(0,1fr)_180px_150px_auto] lg:items-center ${
          busy ? "pointer-events-none select-none blur-[2px] opacity-60" : ""
        }`}
      >
        <Checkbox
          aria-label={`选择 ${skill.name}`}
          checked={checked}
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
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">
            提交 {shortRevision(skill.currentVersion)}
          </p>
          <p className="mt-1">指纹 {skill.currentHash.slice(0, 10)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`打开 ${skill.name} 操作菜单`}
              disabled={busy}
              size="icon"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {skill.claudeDistributed ? "已分发至 Claude" : "未分发至 Claude"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={pending}
                onSelect={() => onDetail(skill)}
              >
                <FileText />
                查看技能详情
              </DropdownMenuItem>
              {skill.source.startsWith("local://") ? (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={() => onOnlineMatch(skill)}
                >
                  <Search />
                  在线匹配
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                disabled={pending || !updateAvailable}
                onSelect={() => onUpdate(skill)}
              >
                <Download />
                {updateAvailable ? "更新" : "已是最新"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
                onSelect={() => onOpenDirectory(skill)}
              >
                <FolderOpen />
                打开技能目录
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
                onSelect={() => onClaudeDistribution(skill)}
              >
                {skill.claudeDistributed ? <Unlink2 /> : <Link2 />}
                {skill.claudeDistributed
                  ? "取消分发至 Claude"
                  : "分发至 Claude"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
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
      {busy ? (
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
    loading: skillsLoading,
    skillsRoot,
    refresh: refreshSkills,
    skills,
  } = useInstalledSkills();
  const {
    check: checkUpdatesNow,
    checking: updatesChecking,
    checkingIds: updateCheckingIds,
    error: updatesError,
    updates,
  } = useSkillUpdates();
  const refreshPage = useCallback(() => {
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
  const [matchError, setMatchError] = useState<string>();
  const matchRequestId = useRef(0);
  const [uninstallTarget, setUninstallTarget] = useState<InstalledSkill>();
  const [githubUrlOpen, setGithubUrlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [directoryError, setDirectoryError] = useState<string>();

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => skills.some((skill) => skill.id === id)),
    );
  }, [skills]);

  const updatesById = useMemo(
    () => new Map(updates.map((item) => [item.id, item])),
    [updates],
  );
  const filteredSkills = useMemo(
    () =>
      filterAndSortSkills(skills, updatesById, {
        search,
        sort,
        source,
        status,
      }),
    [search, skills, sort, source, status, updatesById],
  );

  const groups = useMemo(() => {
    return groupByAuthor(filteredSkills);
  }, [filteredSkills]);

  const filteredIds = filteredSkills.map((skill) => skill.id);
  const allFilteredSelected =
    filteredIds.length > 0 &&
    filteredIds.every((id) => selectedIds.includes(id));
  const selectedFilteredCount = filteredIds.filter((id) =>
    selectedIds.includes(id),
  ).length;
  const filteredSelectionState = allFilteredSelected
    ? true
    : selectedFilteredCount > 0
      ? "indeterminate"
      : false;
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
    if (selectedIds.length === 0) return;
    const result = await checkUpdatesNow(undefined, selectedIds);
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
          : "所有选中技能均已是最新。",
      title: updateCount > 0 ? "发现可用更新" : "检查完成",
      variant: updateCount > 0 ? "info" : "success",
    });
  };
  const closeOnlineMatch = () => {
    matchRequestId.current += 1;
    setMatchSkill(undefined);
    setMatchCandidates([]);
    setMatchError(undefined);
  };
  const openOnlineMatch = async (skill: InstalledSkill) => {
    const requestId = ++matchRequestId.current;
    setMatchSkill(skill);
    setMatchCandidates([]);
    setMatchError(undefined);
    setMatchLoading(true);
    try {
      const result = await searchLocalSkillMatches(skill.id);
      if (requestId === matchRequestId.current) setMatchCandidates(result);
    } catch (reason) {
      if (requestId === matchRequestId.current) {
        setMatchError(normalizeTauriError(reason));
      }
    } finally {
      if (requestId === matchRequestId.current) setMatchLoading(false);
    }
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
    <div>
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => setImportOpen(true)} variant="outline">
              <FolderOpen data-icon="inline-start" />
              导入本地技能
            </Button>
            <Button onClick={() => setGithubUrlOpen(true)} variant="outline">
              <GitBranch data-icon="inline-start" />
              GitHub 链接安装
            </Button>
            <Button onClick={() => navigate("/store")}>
              <Store data-icon="inline-start" />
              技能商店
            </Button>
          </div>
        }
        description="查看和更新已安装技能。"
        title="我的技能"
      />
      <ErrorBanner
        className="mb-6"
        error={pageError}
        onOpenSettings={() => navigate("/settings")}
        onRetry={refreshPage}
      />

      <Card className="mb-6 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                onValueChange={(value) => setSource(value as SkillSourceFilter)}
                value={source}
              >
                <SelectTrigger aria-label="来源筛选" className="w-32">
                  <SelectValue placeholder="来源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部来源</SelectItem>
                    <SelectItem value="skills.sh">skills.sh</SelectItem>
                    <SelectItem value="local">本地导入</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) => setStatus(value as SkillStatusFilter)}
                value={status}
              >
                <SelectTrigger aria-label="状态筛选" className="w-32">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="update">有可用更新</SelectItem>
                    <SelectItem value="current">已是最新</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) => setSort(value as SkillSortMode)}
                value={sort}
              >
                <SelectTrigger aria-label="排序方式" className="w-32">
                  <SelectValue placeholder="排序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="recent">最近安装</SelectItem>
                    <SelectItem value="name">名称</SelectItem>
                    <SelectItem value="source">来源</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
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
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filteredSelectionState}
                  id="select-filtered"
                  onCheckedChange={(checked) =>
                    setSelectedIds((current) =>
                      checked === true
                        ? [...new Set([...current, ...filteredIds])]
                        : current.filter((id) => !filteredIds.includes(id)),
                    )
                  }
                />
                <Label
                  className="font-normal text-muted-foreground"
                  htmlFor="select-filtered"
                >
                  全选
                </Label>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  aria-label="打开技能目录"
                  disabled={!skillsRoot || skillsLoading}
                  onClick={() => void openRootDirectory()}
                  title="打开技能目录"
                  variant="ghost"
                >
                  <FolderOpen data-icon="inline-start" />
                  打开技能目录
                </Button>
                <Button
                  aria-label="重新扫描技能目录"
                  disabled={skillsLoading}
                  onClick={rescanSkills}
                  size="sm"
                  variant="ghost"
                >
                  <ScanSearch data-icon="inline-start" />
                  重新扫描
                </Button>
              </div>
              <Button
                disabled={selectedIds.length === 0 || updatesChecking}
                onClick={() => void checkSelectedUpdates()}
                variant="secondary"
              >
                <RefreshCw data-icon="inline-start" />
                {updatesChecking ? "检查中" : "检查更新"}
              </Button>
            </div>
          </div>
          <Separator className="bg-foreground/20" />
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
                description="换个搜索词或筛选条件试试。"
                icon={Search}
                title="没有匹配的技能"
              />
            ) : (
              <Accordion
                className="flex flex-col gap-3"
                defaultValue={groups.map(([owner]) => owner)}
                type="multiple"
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
                            checking={updateCheckingIds.includes(skill.id)}
                            checked={selectedIds.includes(skill.id)}
                            description={
                              localDescriptionModes[skill.id] ===
                                "translated" ||
                              (localDescriptionModes[skill.id] === undefined &&
                                translations[skill.id])
                                ? translations[skill.id] ?? skill.description
                                : skill.description
                            }
                            key={skill.id}
                            onCheck={(checked) =>
                              setSelectedIds((current) =>
                                checked
                                  ? [...new Set([...current, skill.id])]
                                  : current.filter((id) => id !== skill.id),
                              )
                            }
                            onClaudeDistribution={(item) =>
                              void management.setClaudeDistribution(
                                item.id,
                                !item.claudeDistributed,
                              )
                            }
                            onDetail={setDetailSkill}
                            onOnlineMatch={(item) => void openOnlineMatch(item)}
                            onOpenDirectory={(item) => void openDirectory(item)}
                            onUninstall={setUninstallTarget}
                            onUpdate={(item) => void management.update(item.id)}
                            pending={management.pending === skill.id}
                            skill={skill}
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
        </CardContent>
      </Card>

      <Dialog
        description="查询远端候选，匹配后保留本地文件并启用更新。"
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
            pending={Boolean(management.pending)}
            skill={matchSkill}
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
            onDescriptionModeChange={(mode) =>
              setLocalDescriptionModes((current) => ({
                ...current,
                [detailSkill.id]: mode,
              }))
            }
            onTranslate={() => void translateLocalDescription()}
            skill={detailSkill}
            skillsRoot={skillsRoot}
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
