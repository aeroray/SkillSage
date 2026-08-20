import { useCallback, useEffect, useMemo, useState } from "react";
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
  FolderOpen,
  GitBranch,
  Info,
  Library,
  MoreHorizontal,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageHeader } from "../../components/common/PageHeader";
import { ImportDialog } from "../import/ImportDialog";
import { GithubUrlInstallDialog } from "../store/GithubUrlInstallDialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { openSkillDirectory } from "../../features/skills/api";
import {
  useInstalledSkills,
  useSkillManagement,
  useSkillUpdates,
} from "../../features/skills/hooks";
import type { InstalledSkill } from "../../features/skills/types";
import {
  filterAndSortSkills,
  groupByAuthor,
  sourceLabel,
  type SkillSortMode,
  type SkillSourceFilter,
  type SkillStatusFilter,
} from "../../features/skills/selectors";
import { displayPath } from "../../lib/paths";
import { normalizeTauriError } from "../../lib/tauri";

function shortVersion(version: string) {
  return version.length > 12 ? version.slice(0, 8) : version;
}

function formatInstalledAt(value: string) {
  const numeric = Number(value);
  const date = Number.isNaN(numeric) ? new Date(value) : new Date(numeric * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(date);
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

function SkillRow({
  checked,
  onCheck,
  onHistory,
  onOpenDirectory,
  onUninstall,
  onUpdate,
  pending,
  skill,
  updateAvailable,
}: {
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onHistory: (skill: InstalledSkill) => void;
  onOpenDirectory: (skill: InstalledSkill) => void;
  onUninstall: (skill: InstalledSkill) => void;
  onUpdate: (skill: InstalledSkill) => void;
  pending: boolean;
  skill: InstalledSkill;
  updateAvailable: boolean;
}) {
  return (
    <div className="grid gap-4 border-b border-border px-5 py-4 last:border-b-0 lg:grid-cols-[auto_minmax(0,1fr)_180px_150px_auto] lg:items-center">
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
          {skill.description || "暂无描述"}
        </p>
      </div>
      <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
        <p>{sourceLabel(skill.source)}</p>
        <p>安装于 {formatInstalledAt(skill.installedAt)}</p>
      </div>
      <div className="text-xs text-muted-foreground">
        <p className="font-medium text-foreground">
          {shortVersion(skill.currentVersion)}
        </p>
        <p className="mt-1">{skill.currentHash.slice(0, 10)}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`打开 ${skill.name} 操作菜单`}
            size="icon"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={pending || !updateAvailable}
              onSelect={() => onUpdate(skill)}
            >
              <Download />
              {updateAvailable ? "更新" : "已是最新"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pending || skill.versionHistory.length === 0}
              onSelect={() => onHistory(skill)}
            >
              <Undo2 />
              版本历史
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
  );
}

export function SkillsPage() {
  const navigate = useNavigate();
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
    error: updatesError,
    updates,
  } = useSkillUpdates();
  const refreshPage = useCallback(() => {
    void refreshSkills();
    void checkUpdatesNow();
  }, [checkUpdatesNow, refreshSkills]);
  const management = useSkillManagement(refreshPage);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<SkillSourceFilter>("all");
  const [status, setStatus] = useState<SkillStatusFilter>("all");
  const [sort, setSort] = useState<SkillSortMode>("recent");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [historySkill, setHistorySkill] = useState<InstalledSkill>();
  const [uninstallTarget, setUninstallTarget] = useState<InstalledSkill>();
  const [githubUrlOpen, setGithubUrlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [directoryError, setDirectoryError] = useState<string>();

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => skills.some((skill) => skill.id === id)),
    );
  }, [skills]);

  useEffect(() => {
    if (!skillsLoading) void checkUpdatesNow();
  }, [checkUpdatesNow, skillsLoading]);

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
  const pageError = directoryError ?? skillsError ?? updatesError ?? management.error;
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
  const checkSelectedUpdates = () => {
    if (selectedIds.length === 0) return;
    void checkUpdatesNow(undefined, selectedIds);
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
        description="查看、更新、回滚已安装技能。"
        title="我的技能"
      />
      <ErrorBanner
        className="mb-6"
        error={pageError}
        onOpenSettings={() => navigate("/settings")}
        onRetry={refreshPage}
      />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Library aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <CardTitle>技能目录</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="查看技能目录"
                    className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    type="button"
                  >
                    <Info aria-hidden="true" className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-md p-3" sideOffset={6}>
                  <div className="flex max-w-md min-w-0 flex-col gap-1.5">
                    <p className="font-medium">共享技能目录</p>
                    <p className="break-all font-mono text-xs text-background/80">
                      {skillsRoot
                        ? displayPath(skillsRoot)
                        : "正在读取技能目录路径…"}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <CardDescription className="mt-1">
              {skills.length} 个技能
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              aria-label="刷新技能"
              disabled={skillsLoading || updatesChecking}
              onClick={refreshPage}
              size="sm"
              variant="outline"
            >
              <RefreshCw data-icon="inline-start" />
              刷新技能
            </Button>
          </div>
        </CardHeader>
      </Card>

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
                    <SelectItem value="builtin">内置来源</SelectItem>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                  全选筛选结果 ({selectedFilteredCount})
                </Label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={selectedIds.length === 0 || updatesChecking}
                  onClick={checkSelectedUpdates}
                  variant="secondary"
                >
                  <RefreshCw data-icon="inline-start" />
                  {updatesChecking ? "检查中" : "检查更新"}
                </Button>
              </div>
            </div>
          </div>
          <Separator />
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
                            checked={selectedIds.includes(skill.id)}
                            key={skill.id}
                            onCheck={(checked) =>
                              setSelectedIds((current) =>
                                checked
                                  ? [...new Set([...current, skill.id])]
                                  : current.filter((id) => id !== skill.id),
                              )
                            }
                            onHistory={setHistorySkill}
                            onOpenDirectory={(item) => void openDirectory(item)}
                            onUninstall={setUninstallTarget}
                            onUpdate={(item) => void management.update(item.id)}
                            pending={management.pending === skill.id}
                            skill={skill}
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
        description="查看版本记录并回滚。"
        onClose={() => setHistorySkill(undefined)}
        open={Boolean(historySkill)}
        title="版本历史"
      >
        <div className="flex flex-col gap-3">
          {(historySkill?.versionHistory ?? [])
            .slice()
            .reverse()
            .map((version) => (
              <div
                className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                key={`${version.commit}-${version.hash}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {shortVersion(version.commit)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    hash {version.hash.slice(0, 12)} · {version.recordedAt}
                  </p>
                </div>
                <Button
                  disabled={Boolean(management.pending)}
                  onClick={async () => {
                    if (!historySkill) return;
                    const result = await management.rollback(
                      historySkill.id,
                      version.commit,
                    );
                    if (result) setHistorySkill(undefined);
                  }}
                  variant="outline"
                >
                  回滚
                </Button>
              </div>
            ))}
        </div>
      </Dialog>
      <AlertDialog
        onOpenChange={(open) => !open && setUninstallTarget(undefined)}
        open={Boolean(uninstallTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认卸载</AlertDialogTitle>
            <AlertDialogDescription>
              会删除这个技能在共享目录中的文件夹和记录，所有读取该目录的 AI 工具会立即失去这个技能，不影响其他技能。
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
