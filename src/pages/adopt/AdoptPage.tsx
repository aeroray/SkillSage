import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  FolderInput,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { PageHeader } from "../../components/common/PageHeader";
import { useToast } from "../../components/ui/toast-context";
import { openAdoptPath, useAdoptExecute, useAdoptScan } from "../../features/adopt";
import type { AdoptableItem } from "../../features/adopt";
import { copyText } from "../../lib/clipboard";
import { displayPath } from "../../lib/paths";
import { normalizeTauriError } from "../../lib/tauri";

function AdoptCandidateRow({
  item,
  onCopyError,
  onOpenPath,
  onToggle,
  selected,
  working,
}: {
  item: AdoptableItem;
  onCopyError: (message: string) => void;
  onOpenPath: (path: string) => void;
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
            checked={item.valid && selected}
            disabled={working || !item.valid}
            onCheckedChange={(checked) => onToggle(item.name, checked === true)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-foreground">{item.name}</p>
            {!item.valid ? <Badge variant="muted">无法采纳</Badge> : null}
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

  const validCount = scan?.items.filter((item) => item.valid).length ?? 0;
  const working = scanning || executing;
  const pageError = directoryError ?? error ?? executeError;

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

  return (
    <div>
      <PageHeader
        actions={
          <Button disabled={working} onClick={refreshPage} variant="outline">
            <RefreshCw data-icon="inline-start" />
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
              {scan?.items.length ?? 0} 个条目，可采纳 {validCount} 个。
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                aria-label="全选"
                checked={
                  validCount > 0 && selected.length === validCount
                    ? true
                    : selected.length > 0
                      ? "indeterminate"
                      : false
                }
                disabled={working || validCount === 0}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked === true
                      ? (scan?.items.filter((item) => item.valid).map((item) => item.name) ?? [])
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
    </div>
  );
}
