import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Folder,
  FolderOpen,
  FolderSync,
  Info,
  Link2,
  RefreshCw,
  Trash2,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageHeader } from "../../components/common/PageHeader";
import { useToast } from "../../components/ui/toast";
import {
  ToolSelection,
  type ToolOption,
} from "../../components/common/ToolSelection";
import { useMigration } from "../../features/migrate";
import { openMigratePath } from "../../features/migrate/api";
import type { MigrateItem } from "../../features/migrate";
import { useDetectedTools } from "../../features/tools/hooks";
import { copyText } from "../../lib/clipboard";
import { displayPath } from "../../lib/paths";
import { normalizeTauriError } from "../../lib/tauri";

function classificationLabel(classification: string) {
  if (classification === "remote") return "已在仓库";
  if (classification === "local") return "本地技能";
  return "未知来源";
}

function classificationVariant(classification: string) {
  if (classification === "remote") return "default" as const;
  if (classification === "local") return "secondary" as const;
  return "muted" as const;
}

type MigrationItemCardProps = {
  item: MigrateItem;
  onCopyError: (message: string) => void;
  onManual: (item: MigrateItem) => void;
  onOpenPath: (path: string) => void;
  onRemove: (item: MigrateItem) => void;
  onToggle: (id: string, checked: boolean) => void;
  selected: boolean;
  tools: ToolOption[];
  working: boolean;
};

function MigrationItemCard({
  item,
  onCopyError,
  onManual,
  onOpenPath,
  onRemove,
  onToggle,
  selected,
  tools,
  working,
}: MigrationItemCardProps) {
  const [copied, setCopied] = useState(false);
  const path = displayPath(item.displayPath || item.sourcePath);
  const isLink = item.kind.endsWith("link");
  const KindIcon = isLink ? Link2 : Folder;
  const kindLabel = isLink ? "目录链接" : "真实目录";
  const hasAction = item.canManualHandle || item.canRemove;

  const copyPath = async () => {
    try {
      await copyText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      onCopyError(normalizeTauriError(error));
    }
  };

  return (
    <Card className="border-border/80 shadow-none">
      <CardContent className="flex items-stretch gap-4 p-4">
        <div className="flex shrink-0 items-center">
          <Checkbox
            aria-label={`选择迁移 ${item.name}`}
            checked={item.canTakeover && selected}
            disabled={working || !item.canTakeover}
            onCheckedChange={(checked) => onToggle(item.id, checked === true)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative">
            <div
              className={`flex min-w-0 flex-wrap items-center gap-2${hasAction ? " pr-36" : ""}`}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    aria-label={kindLabel}
                    className="inline-flex size-4 shrink-0 cursor-help items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    role="img"
                    tabIndex={0}
                  >
                    <KindIcon aria-hidden="true" className="size-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>{kindLabel}</TooltipContent>
              </Tooltip>
              <p className="min-w-0 truncate text-sm font-medium text-foreground">
                {item.name}
              </p>
              <Badge variant={classificationVariant(item.classification)}>
                {classificationLabel(item.classification)}
              </Badge>
              <Badge variant="muted">
                {item.location === "public" ? "公共目录" : "工具目录"}
              </Badge>
            </div>
            {hasAction ? (
              <div className="absolute right-0 top-0 flex shrink-0 items-center gap-2">
                {item.canManualHandle ? (
                  <Button
                    disabled={working}
                    onClick={() => onManual(item)}
                    size="sm"
                    variant="outline"
                  >
                    <Wrench data-icon="inline-start" />
                    手动处理
                  </Button>
                ) : null}
                {item.canRemove ? (
                  <Button
                    disabled={working}
                    onClick={() => onRemove(item)}
                    size="sm"
                    variant="destructive"
                  >
                    <Trash2 data-icon="inline-start" />
                    删除无效链接
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <p
            className={`mt-1 line-clamp-2 text-sm text-muted-foreground${hasAction ? " pr-36" : ""}`}
            title={item.description || "暂无描述"}
          >
            {item.description || "暂无描述"}
          </p>
          <div className="mt-3 flex w-full items-center gap-2">
            <div
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-muted/60 px-2 font-mono text-xs text-muted-foreground"
              title={path}
            >
              <p className="min-w-0 flex-1 truncate">{path}</p>
              <Button
                aria-label={copied ? "地址已复制" : "复制地址"}
                className="size-8 shrink-0"
                onClick={() => void copyPath()}
                size="icon"
                title={copied ? "地址已复制" : "复制地址"}
                variant="ghost"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <Button
              aria-label="打开当前目录"
              className="shrink-0"
              disabled={working || item.canRemove}
              onClick={() => onOpenPath(path)}
              size="icon"
              title={item.canRemove ? "路径不可用" : "打开当前目录"}
              variant="outline"
            >
              <FolderOpen />
            </Button>
          </div>
          {item.warning ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
              <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
              {item.warning}
            </p>
          ) : null}
          {item.toolIds.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.toolIds.map((toolId) => (
                <Badge key={toolId} variant="outline">
                  {tools.find((tool) => tool.id === toolId)?.name ?? toolId}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function MigrationPage() {
  const navigate = useNavigate();
  const {
    error: toolsError,
    loading: toolsLoading,
    refresh: refreshTools,
    tools,
  } = useDetectedTools();
  const {
    error,
    execute,
    executing,
    removeLink,
    removing,
    runScan,
    scan,
    scanning,
  } = useMigration();
  const [selected, setSelected] = useState<string[]>([]);
  const [manualItem, setManualItem] = useState<MigrateItem>();
  const [manualAgents, setManualAgents] = useState<string[]>([]);
  const [manualName, setManualName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<MigrateItem>();
  const { toast } = useToast();

  useEffect(() => {
    void runScan(false);
  }, [runScan]);

  useEffect(() => {
    const eligible = scan?.items.filter((item) => item.canTakeover) ?? [];
    setSelected(eligible.map((item) => item.id));
  }, [scan]);

  const toolOptions = useMemo<ToolOption[]>(
    () =>
      tools.map((tool) => ({
        detected: tool.detected,
        id: tool.id,
        name: tool.name,
      })),
    [tools],
  );
  const eligibleCount =
    scan?.items.filter((item) => item.canTakeover).length ?? 0;
  const manualCount =
    scan?.items.filter((item) => item.canManualHandle).length ?? 0;
  const removableCount =
    scan?.items.filter((item) => item.canRemove).length ?? 0;
  const working = scanning || executing || removing;

  const submit = async () => {
    const result = await execute(
      selected.map((sourcePath) => ({
        sourcePath,
        agents:
          scan?.items.find((item) => item.id === sourcePath)?.toolIds ?? [],
      })),
    );
    if (!result) return;
    toast({
      description: `已迁移 ${result.migrated.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`,
      title: result.failed.length ? "迁移部分完成" : "迁移完成",
      variant: result.failed.length ? "warning" : "success",
    });
    setSelected([]);
    await runScan();
  };

  const openPath = async (path: string) => {
    try {
      await openMigratePath(path);
    } catch (error) {
      toast({
        description: normalizeTauriError(error),
        title: "打开目录失败",
        variant: "error",
      });
    }
  };

  const openManual = (item: MigrateItem) => {
    setManualItem(item);
    setManualName(item.name);
    setManualAgents(
      item.toolIds.length > 0
        ? item.toolIds
        : tools.filter((tool) => tool.detected).map((tool) => tool.id),
    );
  };

  const submitManual = async () => {
    if (!manualItem) return;
    const result = await execute([
      {
        agents: manualAgents,
        manual: true,
        sourcePath: manualItem.id,
        targetName: manualName.trim() || undefined,
      },
    ]);
    if (!result) return;
    setManualItem(undefined);
    toast({
      description: `已手动迁移 ${result.migrated.length} 个技能。`,
      title: "手动迁移完成",
      variant: result.failed.length ? "warning" : "success",
    });
    await runScan();
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const result = await removeLink(removeTarget.id);
    toast(
      result === true
        ? {
            description: `已删除无效链接：${removeTarget.name}`,
            title: "删除成功",
            variant: "success",
          }
        : {
            description: result,
            title: "删除失败",
            variant: "error",
          },
    );
    setRemoveTarget(undefined);
  };

  return (
    <div>
      <PageHeader
        description="扫描工具和公共目录，把已有技能纳入中央仓库。"
        title="迁移技能"
      />
      <ErrorBanner
        className="mb-6"
        error={toolsError ?? error}
        onOpenSettings={() => navigate("/settings")}
        onRetry={() => {
          void runScan();
          void refreshTools();
        }}
      />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <FolderSync aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <CardTitle>扫描范围</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="查看扫描目录"
                    className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    type="button"
                  >
                    <Info aria-hidden="true" className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-md p-3" sideOffset={6}>
                  <div className="flex max-w-md min-w-0 flex-col gap-1.5">
                    <p className="font-medium">扫描目录</p>
                    {scan?.scannedRoots.length ? (
                      scan.scannedRoots.map((root) => (
                        <p
                          className="break-all font-mono text-xs text-background/80"
                          key={root}
                        >
                          {displayPath(root)}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs text-background/80">暂无扫描目录</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <CardDescription className="mt-1">
              {scan?.items.length ?? 0} 个条目
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              disabled={working}
              onClick={() => void runScan()}
              size="sm"
              variant="outline"
            >
              <RefreshCw data-icon="inline-start" />
              重新扫描
            </Button>
          </div>
        </CardHeader>
        {scanning ? (
          <CardContent className="pb-5">
            <div aria-busy="true" className="flex flex-col gap-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>扫描结果</CardTitle>
            <CardDescription className="mt-1">
              可直接迁移 {eligibleCount} 个，需手动处理 {manualCount} 个，可删除{" "}
              {removableCount} 个无效链接。
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                aria-label="全选"
                checked={
                  eligibleCount > 0 && selected.length === eligibleCount
                    ? true
                    : selected.length > 0
                      ? "indeterminate"
                      : false
                }
                disabled={working || eligibleCount === 0}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked === true
                      ? (scan?.items
                          .filter((item) => item.canTakeover)
                          .map((item) => item.id) ?? [])
                      : [],
                  )
                }
              />
              <span>全选</span>
            </label>
            <Button
              disabled={selected.length === 0 || working || toolsLoading}
              onClick={() => void submit()}
            >
              <FolderSync data-icon="inline-start" />
              {executing ? "迁移中…" : "迁移所选技能"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-5">
          {scanning ? (
            <div aria-busy="true" className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : scan?.items.length ? (
            scan.items.map((item) => (
              <MigrationItemCard
                item={item}
                key={item.id}
                onCopyError={(message) =>
                  toast({
                    description: message,
                    title: "复制地址失败",
                    variant: "error",
                  })
                }
                onManual={openManual}
                onOpenPath={(path) => void openPath(path)}
                onRemove={setRemoveTarget}
                onToggle={(id, checked) =>
                  setSelected((current) =>
                    checked
                      ? [...new Set([...current, id])]
                      : current.filter((value) => value !== id),
                  )
                }
                selected={selected.includes(item.id)}
                tools={toolOptions}
                working={working}
              />
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FolderSync
                aria-hidden="true"
                className="size-8 text-muted-foreground"
              />
              <p className="text-sm font-medium text-foreground">
                没有找到待迁移技能
              </p>
              <p className="text-sm text-muted-foreground">
                这些目录里的技能都已由 SkillSage 管理。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        description="未知来源不会自动迁移，请确认名称和工具。"
        onClose={() => setManualItem(undefined)}
        open={Boolean(manualItem)}
        title="手动迁移"
      >
        <div className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="manual-skill-name">技能名称</FieldLabel>
              <FieldDescription>
                使用 kebab-case，例如 my-skill。
              </FieldDescription>
              <Input
                id="manual-skill-name"
                onChange={(event) => setManualName(event.target.value)}
                value={manualName}
              />
            </Field>
          </FieldGroup>
          <ToolSelection
            agents={manualAgents}
            disabled={working}
            onToggle={(id, checked) =>
              setManualAgents((current) =>
                checked
                  ? [...new Set([...current, id])]
                  : current.filter((value) => value !== id),
              )
            }
            tools={toolOptions}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setManualItem(undefined)} variant="ghost">
              取消
            </Button>
            <Button
              disabled={
                !manualName.trim() || manualAgents.length === 0 || working
              }
              onClick={() => void submitManual()}
            >
              {executing ? "处理中…" : "迁移并分发"}
            </Button>
          </div>
        </div>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setRemoveTarget(undefined)}
        open={Boolean(removeTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除无效链接？</AlertDialogTitle>
            <AlertDialogDescription>
              只删除无效链接，不会删除目标目录或其他技能。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-all rounded-md bg-muted/60 p-3 font-mono text-xs text-muted-foreground">
            {removeTarget
              ? displayPath(removeTarget.displayPath || removeTarget.sourcePath)
              : ""}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={() => void confirmRemove()}
              variant="destructive"
            >
              {removing ? "删除中…" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
