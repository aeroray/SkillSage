import { useState } from "react";
import {
  Check,
  ExternalLink,
  FolderInput,
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
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { displayPath } from "../../lib/paths";
import { useTools } from "../../features/tools/hooks";
import type { ToolView } from "../../features/tools/api";

/**
 * The tool registry, as resolved on this machine.
 *
 * The one question this answers is whether a tool reads the shared skills
 * directory. If it does, it needs no per-skill link; if it does not, SkillSage
 * has to link each skill into that tool's own directory. Tools gain shared
 * support over time, so the flag is a user setting rather than a constant.
 */
export function ToolSettingsCard() {
  const { error, loading, refresh, save, saving, tools } = useTools();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Wrench aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <CardTitle>AI 工具与分发</CardTitle>
          <CardDescription className="mt-1">
            技能始终安装在公共目录。已经读取公共目录的工具不需要分发；其余工具需要单独建立链接。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-5">
        {error ? (
          <p className="text-xs text-destructive-text" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div
            aria-busy="true"
            aria-label="正在加载工具列表"
            className="flex flex-col gap-2"
          >
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {tools.map((tool) => (
                <ToolRow
                  key={tool.id}
                  onSave={save}
                  saving={saving === tool.id}
                  tool={tool}
                />
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                共 {tools.length} 个工具，其中{" "}
                {tools.filter((tool) => tool.detected).length} 个已安装。
              </p>
              <Button
                disabled={loading}
                onClick={() => void refresh()}
                size="sm"
                variant="outline"
              >
                重新检测
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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

  const commitPath = async () => {
    const next = draftPath.trim();
    const unchanged = next === (tool.skillsDir ?? "");
    if (unchanged) {
      setEditing(false);
      return;
    }
    // An empty value clears the override, restoring the registry path.
    const ok = await onSave(
      tool.id,
      tool.readsShared === tool.readsSharedDefault ? undefined : tool.readsShared,
      next || undefined,
    );
    if (ok) setEditing(false);
  };

  const toggleReadsShared = (checked: boolean) => {
    // Sending the default back as `undefined` clears the override, so a later
    // registry correction reaches a user who never meant to pin anything.
    const value = checked === tool.readsSharedDefault ? undefined : checked;
    void onSave(tool.id, value, undefined);
  };

  const reset = () => {
    setDraftPath("");
    setEditing(false);
    void onSave(tool.id, undefined, undefined);
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-4">
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
                vendor docs, so its path may be wrong. Saying so is better than
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
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`编辑 ${tool.label} 的技能目录`}
                disabled={saving}
                onClick={() => {
                  setDraftPath(tool.skillsDir ?? "");
                  setEditing((current) => !current);
                }}
                size="icon-sm"
                variant="ghost"
              >
                <FolderInput aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>自定义技能目录</TooltipContent>
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

      <a
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        href={tool.source}
        rel="noreferrer"
        target="_blank"
      >
        <Pencil aria-hidden="true" className="size-3" />
        查看依据
        <ExternalLink aria-hidden="true" className="size-3" />
      </a>
    </li>
  );
}
