import { AlertCircle, CheckCircle2, Download, LoaderCircle, RefreshCw } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { isBrowserPreview } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { ReleaseNotes } from "./ReleaseNotes";
import { useAppUpdateStore } from "./store";

function formatLastChecked(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** A thin determinate bar. Indeterminate (no content-length) is a pulsing full
 * bar rather than a fake percentage, because inventing motion for unknown
 * progress would claim more than we know. */
function DownloadProgress({ percent }: { percent: number | null }) {
  if (percent === null) {
    return (
      <div
        aria-label="正在下载，进度未知"
        className="h-1.5 w-full animate-pulse rounded-full bg-primary/40"
        role="progressbar"
      />
    );
  }
  return (
    <div
      aria-label="下载进度"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/**
 * The app-update module.
 *
 * Rebuilt around what the user is actually deciding: *which* version they would
 * move to, and *what changed*. The previous version showed a status line and a
 * button but never the release notes — even though the backend has always
 * fetched them (`AppUpdateInfo.notes`) and we author them per release in
 * `docs/releases/<tag>.md`. So the one piece of information that justifies
 * pressing "立即安装" was the one piece not on screen.
 */
export function AppUpdatePanel({ currentVersion }: { currentVersion: string }) {
  const available = useAppUpdateStore((state) => state.available);
  const checking = useAppUpdateStore((state) => state.checking);
  const error = useAppUpdateStore((state) => state.error);
  const install = useAppUpdateStore((state) => state.install);
  const phase = useAppUpdateStore((state) => state.phase);
  const progress = useAppUpdateStore((state) => state.progress);
  const lastCheckedAt = useAppUpdateStore((state) => state.lastCheckedAt);
  const check = useAppUpdateStore((state) => state.check);
  const source = useAppUpdateStore((state) => state.source);

  const downloading = phase === "downloading";
  const installing = phase === "installing";
  const busy = downloading || installing;
  const lastChecked = formatLastChecked(lastCheckedAt);
  // The preview has no backend to check against, so the controls are inert there.
  const preview = isBrowserPreview();

  const sourceLabel =
    source === "direct" ? "GitHub 直连" : (source ?? undefined);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            aria-live="polite"
            className="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            {checking ? (
              <>
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                />
                正在检查更新
              </>
            ) : installing ? (
              "正在安装，完成后会自动重启"
            ) : downloading ? (
              "正在下载更新"
            ) : error && !available ? (
              "检查更新失败"
            ) : available ? (
              // Naming both ends answers "what am I moving to" in one glance;
              // the old copy showed only the target.
              <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                <span className="font-mono text-xs text-muted-foreground">
                  v{currentVersion}
                </span>
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
                <span className="font-mono text-xs">
                  v{available.version}
                </span>
              </span>
            ) : lastChecked ? (
              <>
                <CheckCircle2
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-success-text"
                />
                已是最新版本
              </>
            ) : (
              "尚未检查更新"
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lastChecked ? `上次检查：${lastChecked}` : "启动后会自动检查一次"}
            {/* Naming the source makes a slow or failing mirror diagnosable
                instead of invisible. */}
            {sourceLabel ? ` · 通过 ${sourceLabel}` : ""}
          </p>
        </div>
        {available && !busy ? (
          <Badge className="shrink-0" variant="success">
            可更新
          </Badge>
        ) : null}
      </div>

      {/* Progress replaces the notes region while downloading, so the panel
          never grows taller mid-action. */}
      {busy ? (
        <div className="flex flex-col gap-2">
          <DownloadProgress percent={progress} />
          <p className="text-xs tabular-nums text-muted-foreground">
            {installing
              ? "正在写入并校验安装包…"
              : progress === null
                ? "正在下载…"
                : `已下载 ${progress}%`}
          </p>
        </div>
      ) : available?.notes ? (
        <div className="rounded-md border border-border bg-muted/30">
          <p className="border-b border-border px-3 py-2 text-xs font-medium text-foreground">
            本次更新内容
          </p>
          {/* Bounded so a long changelog cannot push the actions off-screen;
              the notes themselves own the scroll. */}
          <div className="scrollbar-subtle max-h-56 overflow-y-auto px-3 py-3">
            <ReleaseNotes markdown={available.notes} />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive-text">
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span className="min-w-0">
            {available ? "安装失败：" : "检查失败："}
            {error}
          </span>
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={checking || busy || preview}
          onClick={() => {
            void check().catch(() => undefined);
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCw
            className={cn(checking && "animate-spin")}
            data-icon="inline-start"
          />
          {checking ? "检查中…" : "检查更新"}
        </Button>
        {available ? (
          <Button
            disabled={busy || preview}
            onClick={() => void install()}
            size="sm"
          >
            <Download data-icon="inline-start" />
            {downloading
              ? "下载中…"
              : installing
                ? "安装中…"
                : phase === "error"
                  ? "重试安装"
                  : "立即安装"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
