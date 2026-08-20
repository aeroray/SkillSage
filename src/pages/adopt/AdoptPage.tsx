import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  FilePenLine,
  FolderInput,
  FolderOpen,
  ScanSearch,
  Trash2,
  X,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageHeader } from "../../components/common/PageHeader";
import { useToast } from "../../components/ui/toast-context";
import {
  openAdoptPath,
  removeAdoptCandidate,
  renameAdoptCandidate,
  useAdoptExecute,
  useAdoptScan,
} from "../../features/adopt";
import type { AdoptableItem } from "../../features/adopt";
import { copyText } from "../../lib/clipboard";
import { displayPath } from "../../lib/paths";
import { normalizeTauriError } from "../../lib/tauri";

function AdoptCandidateRow({
  item,
  onCopyError,
  onOpenPath,
  onRemove,
  onRename,
  onToggle,
  selected,
  working,
}: {
  item: AdoptableItem;
  onCopyError: (message: string) => void;
  onOpenPath: (path: string) => void;
  onRemove: (item: AdoptableItem) => void;
  onRename: (item: AdoptableItem) => void;
  onToggle: (name: string, checked: boolean) => void;
  selected: boolean;
  working: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const path = displayPath(item.path);

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
            aria-label={`选择采纳 ${item.name}`}
            checked={item.valid && !item.declaredName && selected}
            disabled={working || !item.valid || Boolean(item.declaredName)}
            onCheckedChange={(checked) => onToggle(item.name, checked === true)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="min-w-0 truncate text-sm font-medium text-foreground">{item.name}</p>
              {item.declaredName ? <Badge className="bg-warning/10 text-warning" variant="muted">名称需整理</Badge> : null}
              {!item.valid ? <Badge variant="muted">无法采纳</Badge> : null}
            </div>
            {item.declaredName ? (
              <Button
                className="shrink-0"
                disabled={working}
                onClick={() => onRename(item)}
                size="sm"
                variant="outline"
              >
                <FilePenLine data-icon="inline-start" />
                整理名称
              </Button>
            ) : !item.valid && item.removable ? (
              <Button
                className="shrink-0"
                disabled={working}
                onClick={() => onRemove(item)}
                size="sm"
                variant="destructive"
              >
                <Trash2 data-icon="inline-start" />
                删除条目
              </Button>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground" title={item.description || "暂无描述"}>
            {item.description || "暂无描述"}
          </p>
          <div className="mt-3 flex w-full items-center gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-muted/60 px-2 font-mono text-xs text-muted-foreground" title={path}>
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
              disabled={working}
              onClick={() => onOpenPath(path)}
              size="icon"
              title="打开当前目录"
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
        </div>
      </CardContent>
    </Card>
  );
}

export function AdoptPage() {
  const navigate = useNavigate();
  const { error, runScan, scan, scanning } = useAdoptScan();
  const [selected, setSelected] = useState<string[]>([]);
  const [directoryError, setDirectoryError] = useState<string>();
  const [removeTarget, setRemoveTarget] = useState<AdoptableItem>();
  const [renameTarget, setRenameTarget] = useState<AdoptableItem>();
  const [actionError, setActionError] = useState<string>();
  const [actionBusy, setActionBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    void runScan(false);
  }, [runScan]);

  useEffect(() => {
    const recommended = scan?.items.filter((item) => item.recommended) ?? [];
    setSelected(recommended.map((item) => item.name));
  }, [scan]);

  const refreshPage = () => {
    void runScan();
  };
  const handleCompleted = () => {
    void runScan();
  };
  const { error: executeError, execute, executing } = useAdoptExecute(handleCompleted);

  const adoptableItems = scan?.items.filter((item) => item.valid && !item.declaredName) ?? [];
  const adoptableCount = adoptableItems.length;
  const working = scanning || executing || actionBusy;
  const pageError = directoryError ?? actionError ?? error ?? executeError;

  const submit = async () => {
    const result = await execute(selected.map((name) => ({ name })));
    if (!result) return;
    toast({
      description: `已采纳 ${result.adopted.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`,
      title: result.failed.length ? "采纳部分完成" : "采纳完成",
      variant: result.failed.length ? "warning" : "success",
    });
    setSelected([]);
  };

  const openPath = async (path: string) => {
    setDirectoryError(undefined);
    try {
      await openAdoptPath(path);
    } catch (error) {
      setDirectoryError(normalizeTauriError(error));
    }
  };

  const removeCandidate = async () => {
    if (!removeTarget) return;
    setActionError(undefined);
    setActionBusy(true);
    try {
      await removeAdoptCandidate(removeTarget.name);
      setRemoveTarget(undefined);
      toast({ description: `已删除无效条目“${removeTarget.name}”。`, title: "删除完成", variant: "success" });
      await runScan();
    } catch (error) {
      setActionError(normalizeTauriError(error));
    } finally {
      setActionBusy(false);
    }
  };

  const renameCandidate = async () => {
    if (!renameTarget?.declaredName) return;
    setActionError(undefined);
    setActionBusy(true);
    try {
      const nextName = await renameAdoptCandidate(renameTarget.name);
      setRenameTarget(undefined);
      toast({ description: `文件夹已整理为“${nextName}”，请重新确认采纳。`, title: "名称已整理", variant: "success" });
      await runScan();
    } catch (error) {
      setActionError(normalizeTauriError(error));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        actions={
          <Button disabled={working} onClick={refreshPage} variant="outline">
            <ScanSearch data-icon="inline-start" />
            重新扫描
          </Button>
        }
        description={
          scan
            ? `扫描 ${displayPath(scan.scannedRoot)}，把已在共享目录中但还未被跟踪的技能纳入管理。`
            : "扫描共享技能目录，把已经在那里但还未被跟踪的技能纳入管理。"
        }
        title="采纳技能"
      />
      <ErrorBanner
        className="mb-6"
        error={pageError}
        onOpenSettings={() => navigate("/settings")}
        onRetry={refreshPage}
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>扫描结果</CardTitle>
            <CardDescription className="mt-1">
              {scan?.items.length ?? 0} 个条目，可直接采纳 {adoptableCount} 个。
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                aria-label="全选"
                checked={
                  adoptableCount > 0 && selected.length === adoptableCount
                    ? true
                    : selected.length > 0
                      ? "indeterminate"
                      : false
                }
                disabled={working || adoptableCount === 0}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked === true
                      ? adoptableItems.map((item) => item.name)
                      : [],
                  )
                }
              />
              <span>全选</span>
            </label>
            <Button disabled={selected.length === 0 || working} onClick={() => void submit()}>
              <FolderInput data-icon="inline-start" />
              {executing ? "采纳中…" : "采纳所选"}
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
              <AdoptCandidateRow
                item={item}
                key={item.name}
                onCopyError={(message) =>
                  toast({ description: message, title: "复制地址失败", variant: "error" })
                }
                onOpenPath={(path) => void openPath(path)}
                onRemove={setRemoveTarget}
                onRename={setRenameTarget}
                onToggle={(name, checked) =>
                  setSelected((current) =>
                    checked ? [...new Set([...current, name])] : current.filter((value) => value !== name),
                  )
                }
                selected={selected.includes(item.name)}
                working={working}
              />
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FolderInput aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">没有找到可采纳的技能</p>
              <p className="text-sm text-muted-foreground">共享目录里的技能都已由 SkillSage 管理。</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !actionBusy) setRemoveTarget(undefined);
        }}
        open={Boolean(removeTarget)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogCancel
            aria-label="关闭确认窗口"
            className="absolute right-3 top-3"
            size="icon"
            variant="ghost"
          >
            <X />
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogTitle>删除无效条目？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除共享技能目录中的“{removeTarget?.name}”文件夹。这个目录没有有效的 SKILL.md，删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={actionBusy} onClick={() => void removeCandidate()} variant="destructive">
              {actionBusy ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !actionBusy) setRenameTarget(undefined);
        }}
        open={Boolean(renameTarget)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogCancel
            aria-label="关闭确认窗口"
            className="absolute right-3 top-3"
            size="icon"
            variant="ghost"
          >
            <X />
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogTitle>按 SKILL.md 名称整理？</AlertDialogTitle>
            <AlertDialogDescription>
              将文件夹“{renameTarget?.name}”改为“{renameTarget?.declaredName}”。之后采纳时会使用 SKILL.md 中的名称；如果目标名称已存在，操作会中止。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={actionBusy} onClick={() => void renameCandidate()}>
              {actionBusy ? "整理中…" : "确认整理"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
