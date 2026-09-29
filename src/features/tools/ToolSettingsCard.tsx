import { useEffect, useMemo, useState } from "react";
import { open as openDirectoryDialog } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Copy,
  FolderInput,
  FolderOpen,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
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
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { displayPath } from "../../lib/paths";
import { copyText } from "../../lib/clipboard";
import { normalizeTauriError } from "../../lib/tauri";
import { openPath } from "../../features/skills/api";
import { useTools } from "../../features/tools/hooks";
import type { ToolView } from "../../features/tools/api";

/**
 * The tool registry, as resolved on this machine.
 *
 * The card itself stays small — it is a summary with one entry point. The full
 * list lives in a dialog because ~27 rows inline made the whole Settings page
 * unreadable, and because the rows are something you configure once rather than
 * scan while working.
 *
 * The one question a row answers is whether a tool reads the shared skills
 * directory. If it does, it needs no per-skill link; if it does not, SkillSage
 * has to link each skill into that tool's own directory. Tools gain shared
 * support over time, so the flag is a setting rather than a constant.
 */
export function ToolSettingsCard() {
  const { error, loading, refresh, save, savingIds, tools } = useTools();
  const [open, setOpen] = useState(false);

  // Only tools that are actually installed. A tool the user does not have is
  // not something they can act on, and listing ~27 of them buries the two or
  // three that matter.
  const detected = useMemo(
    () => tools.filter((tool) => tool.detected),
    [tools],
  );
  const needsLink = detected.filter((tool) => !tool.readsShared);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Wrench aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle>AI 工具与分发</CardTitle>
            <CardDescription className="mt-1">
              技能始终安装在公共目录。已经读取公共目录的工具不需要分发；其余工具需要单独建立链接。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-5">
          {error ? (
            <p className="text-xs text-destructive-text" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <Skeleton className="h-12" />
          ) : (
            <>
              <dl className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-muted-foreground">
                    检测到的工具
                  </dt>
                  <dd className="text-xs font-medium tabular-nums text-foreground">
                    {detected.length}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-muted-foreground">
                    需要分发
                  </dt>
                  <dd className="text-xs font-medium tabular-nums text-foreground">
                    {needsLink.length}
                  </dd>
                </div>
              </dl>

              {detected.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {detected.map((tool) => (
                    <li key={tool.id}>
                      <Badge variant={tool.readsShared ? "muted" : "default"}>
                        {tool.label}
                        {tool.readsShared ? " · 读公共目录" : ""}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  尚未检测到任何 AI 工具。
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={() => setOpen(true)} size="sm" variant="outline">
                  管理工具与目录
                </Button>
                <Button
                  disabled={loading}
                  onClick={() => void refresh()}
                  size="sm"
                  variant="ghost"
                >
                  重新检测
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ToolDialog
        loading={loading}
        onClose={() => setOpen(false)}
        onSave={save}
        open={open}
        savingIds={savingIds}
        tools={tools}
      />
    </>
  );
}

/**
 * The full registry. Installed tools come first — that is the order the user
 * cares about — and the rest are behind a disclosure rather than shown flat.
 */
function ToolDialog({
  loading,
  onClose,
  onSave,
  open,
  savingIds,
  tools,
}: {
  loading: boolean;
  onClose: () => void;
  onSave: (
    toolId: string,
    readsShared: boolean | undefined,
    skillsDir: string | undefined,
  ) => Promise<boolean>;
  open: boolean;
  /** Which tools currently have a save in flight, so each row shows only its
   * own busy state while another row's save runs. */
  savingIds: Set<string>;
  tools: ToolView[];
}) {
  const [showAll, setShowAll] = useState(false);

  const detected = tools.filter((tool) => tool.detected);
  const others = tools.filter((tool) => !tool.detected);
  const visible = showAll ? [...detected, ...others] : detected;

  return (
    <Dialog
      contentClassName="px-6 py-5"
      description="勾选「读取公共技能目录」后，该工具不再需要分发，已有链接会被移除。"
      onClose={onClose}
      open={open}
      title="AI 工具与分发"
    >
      {loading ? (
        <div
          aria-busy="true"
          aria-label="正在加载工具列表"
          className="flex flex-col gap-2"
        >
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {detected.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              尚未检测到任何 AI 工具。安装工具后回到此处点「重新检测」，或展开完整清单手动指定目录。
            </p>
          ) : null}

          <ul className="flex flex-col gap-2">
            {visible.map((tool) => (
              <ToolRow
                key={tool.id}
                onSave={onSave}
                saving={savingIds.has(tool.id)}
                tool={tool}
              />
            ))}
          </ul>

          {others.length > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                另有 {others.length} 个工具未检测到。
              </p>
              <Button
                onClick={() => setShowAll((current) => !current)}
                size="sm"
                variant="ghost"
              >
                {showAll ? "收起" : "展开完整清单"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function ToolRow({
  onSave,
  saving,
  tool,
}: {
  onSave: (
    toolId: string,
    readsShared: boolean | undefined,
    skillsDir: string | undefined,
  ) => Promise<boolean>;
  saving: boolean;
  tool: ToolView;
}) {
  const [editing, setEditing] = useState(false);
  const [draftPath, setDraftPath] = useState(tool.skillsDir ?? "");
  const [browsing, setBrowsing] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Set when the tool's own directory does not exist yet and its parent was
   * opened instead, so the row can say which folder it actually showed. */
  const [openNote, setOpenNote] = useState<string>();

  useEffect(() => {
    setDraftPath(tool.skillsDir ?? "");
  }, [tool.skillsDir]);

  const copyPath = async () => {
    if (!tool.skillsDir) return;
    try {
      await copyText(tool.skillsDir);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the path stays selectable either way.
    }
  };

  /**
   * Opens the tool's directory.
   *
   * A tool that has never been used has no `skills/` folder, and refusing to
   * open anything made the button look broken. The backend opens the nearest
   * existing ancestor instead and reports it, so this says which folder was
   * shown rather than silently opening a different one.
   */
  const openToolDirectory = async () => {
    if (!tool.skillsDir) return;
    setOpenNote(undefined);
    try {
      const result = await openPath(tool.skillsDir);
      if (!result.exact) {
        setOpenNote(`该目录尚未创建，已打开上级目录：${displayPath(result.opened)}`);
        window.setTimeout(() => setOpenNote(undefined), 6000);
      }
    } catch (error) {
      setOpenNote(normalizeTauriError(error));
      window.setTimeout(() => setOpenNote(undefined), 6000);
    }
  };

  const persist = async (nextPath: string | undefined) => {
    // Sending the default back as `undefined` clears the override, so a later
    // registry correction reaches a user who never meant to pin anything.
    const readsShared =
      tool.readsShared === tool.readsSharedDefault ? undefined : tool.readsShared;
    return onSave(tool.id, readsShared, nextPath);
  };

  const commitPath = async () => {
    const next = draftPath.trim();
    if (next === (tool.skillsDir ?? "")) {
      setEditing(false);
      return;
    }
    if (await persist(next || undefined)) setEditing(false);
  };

  /** Native directory picker. Typing stays available for a path the picker
   * cannot reach (a network share, or a tool on another drive). */
  const browse = async () => {
    setBrowsing(true);
    try {
      const selected = await openDirectoryDialog({
        directory: true,
        multiple: false,
        title: `选择 ${tool.label} 的技能目录`,
      });
      if (typeof selected === "string") {
        setDraftPath(selected);
        await persist(selected);
        setEditing(false);
      }
    } catch {
      // A cancelled dialog and the browser preview both leave the path as-is.
    } finally {
      setBrowsing(false);
    }
  };

  const toggleReadsShared = (checked: boolean) => {
    const value = checked === tool.readsSharedDefault ? undefined : checked;
    void onSave(tool.id, value, undefined);
  };

  const reset = () => {
    setDraftPath("");
    setEditing(false);
    void onSave(tool.id, undefined, undefined);
  };

  return (
    <li className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {tool.label}
            </span>
            {tool.detected ? (
              <Badge variant="success">已安装</Badge>
            ) : (
              <Badge variant="muted">未检测到</Badge>
            )}
            {tool.customized ? <Badge variant="muted">已自定义</Badge> : null}
            {/* An unverified entry came from a third-party table rather than
                vendor docs, so its path may be wrong. Saying so beats
                presenting a guess as fact. */}
            {!tool.verified ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Badge variant="outline">
                      <ShieldAlert aria-hidden="true" />
                      路径未核实
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs leading-5" sideOffset={6}>
                  该工具的目录来自第三方清单而非官方文档，可能需要手动校正。
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-2 flex items-center gap-2">
              <Input
                aria-label={`${tool.label} 技能目录`}
                className="h-8 text-xs"
                onChange={(event) => setDraftPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitPath();
                  if (event.key === "Escape") setEditing(false);
                }}
                placeholder="留空以使用默认目录"
                value={draftPath}
              />
              <Button
                aria-label="保存目录"
                disabled={saving}
                onClick={() => void commitPath()}
                size="icon-sm"
                variant="outline"
              >
                <Check aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <p
              className="mt-1 truncate font-mono text-xs text-muted-foreground"
              title={tool.skillsDir ?? undefined}
            >
              {tool.skillsDir ? displayPath(tool.skillsDir) : "无独立目录"}
            </p>
          )}

          {/* Only shown after a fallback or a failure, so the row stays quiet
              in the normal case. */}
          {openNote ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground" role="status">
              {openNote}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`复制 ${tool.label} 的技能目录路径`}
                disabled={!tool.skillsDir}
                onClick={() => void copyPath()}
                size="icon-sm"
                variant="ghost"
              >
                {copied ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>
              {copied ? "已复制路径" : "复制路径"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`打开 ${tool.label} 的技能目录`}
                disabled={!tool.skillsDir}
                onClick={() => void openToolDirectory()}
                size="icon-sm"
                variant="ghost"
              >
                <FolderOpen aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs leading-5" sideOffset={6}>
              打开目录；目录尚未创建时会打开上级目录
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`选择 ${tool.label} 的技能目录`}
                disabled={saving || browsing}
                onClick={() => void browse()}
                size="icon-sm"
                variant="ghost"
              >
                <FolderInput aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>选择目录</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`手动输入 ${tool.label} 的技能目录`}
                disabled={saving}
                onClick={() => setEditing((current) => !current)}
                size="icon-sm"
                variant="ghost"
              >
                <Pencil aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>手动输入路径</TooltipContent>
          </Tooltip>
          {tool.customized ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`恢复 ${tool.label} 的默认设置`}
                  disabled={saving}
                  onClick={reset}
                  size="icon-sm"
                  variant="ghost"
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>恢复默认</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {/* The one setting that decides whether this tool needs distributing
          into. Only shown for tools that actually have a directory of their
          own — a tool with none cannot accept a link either way. */}
      {tool.distributable || tool.readsShared ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md bg-background/60 p-2.5">
          <Checkbox
            aria-label={`${tool.label} 读取公共技能目录`}
            checked={tool.readsShared}
            className="mt-0.5"
            disabled={saving}
            onCheckedChange={(value) => toggleReadsShared(value === true)}
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-foreground">
              读取公共技能目录
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {tool.readsShared
                ? "技能已在该工具中可用，无需分发。"
                : "需要为每个技能单独建立链接。"}
            </span>
          </span>
        </label>
      ) : (
        <p className="rounded-md bg-background/60 p-2.5 text-xs leading-5 text-muted-foreground">
          该工具没有独立目录，只能读取公共目录。
        </p>
      )}
    </li>
  );
}
