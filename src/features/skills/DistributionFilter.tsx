import { ArrowLeftRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import type { ToolOption } from "./types";

/**
 * Filters by which tools a skill is distributed into.
 *
 * The tools are the control: one badge per installed tool, clicked to toggle.
 * An earlier version hid them behind a dropdown and paired them with a
 * separate outcome chip row (all / missing / some-but-not-all), which made the
 * user name the question before asking it. The badges show what can be filtered
 * by, and selecting several is a union — "show me what I put in these tools".
 *
 * Inverting asks the other question, "what have I *not* put in these tools",
 * and is a single toggle rather than a third badge, because it is a property of
 * the whole selection rather than another thing to select.
 *
 * The row scrolls horizontally when there are more tools than fit, without a
 * visible scrollbar: a track would compete with the badges it sits beside, and
 * the row is still reachable by wheel, trackpad and keyboard.
 */
export function DistributionFilter({
  inverted,
  onInvertedChange,
  onToggleTool,
  toolIds,
  tools,
}: {
  inverted: boolean;
  onInvertedChange: (inverted: boolean) => void;
  onToggleTool: (toolId: string) => void;
  toolIds: string[];
  tools: ToolOption[];
}) {
  const active = toolIds.length > 0;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-foreground/70">分发</span>

      {tools.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          没有需要分发的工具
        </span>
      ) : (
        <>
          <div
            aria-label="按分发到的工具筛选"
            className="no-scrollbar flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto"
            role="group"
          >
            {tools.map((tool) => {
              const selected = toolIds.includes(tool.id);
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    // Mirrors the Badge primitive's geometry so the row reads
                    // as badges, but as a real button so it is announced as a
                    // toggle rather than a label.
                    "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    selected
                      ? "border-primary-border bg-primary-soft text-primary-text"
                      : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                  )}
                  key={tool.id}
                  onClick={() => onToggleTool(tool.id)}
                  type="button"
                >
                  {tool.label}
                </button>
              );
            })}
          </div>

          {/* Only offered once something is selected: inverting an empty
              selection would be "skills in none of no tools", which is every
              skill and so says nothing. */}
          {active ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={inverted ? "取消反选" : "反选：改为显示未分发到所选工具的技能"}
                  aria-pressed={inverted}
                  className={cn(
                    "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    inverted
                      ? "border-primary-border bg-primary-soft text-primary-text"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => onInvertedChange(!inverted)}
                  type="button"
                >
                  <ArrowLeftRight aria-hidden="true" className="size-3" />
                  反选
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs leading-5" sideOffset={6}>
                {inverted
                  ? "当前显示未分发到所选工具的技能；再次点击恢复为已分发的。"
                  : "改为显示未分发到所选工具的技能。"}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </>
      )}
    </div>
  );
}
