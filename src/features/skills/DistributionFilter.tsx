import { ChevronDown, ListFilter, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import type { ToolOption } from "./types";
import type { SkillDistributionMatch } from "./selectors";

/**
 * The outcome axis. `全部` is the escape hatch every filter row here leads
 * with: it widens the outcome without discarding the chosen tools, which the
 * empty state's "清除筛选条件" cannot do because that clears the tools too.
 *
 * The other two are exact complements — a skill is either in every selected
 * tool or missing from at least one — so their counts always sum to the total.
 */
const MATCH_MODES: Array<{ label: string; value: SkillDistributionMatch }> = [
  { label: "全部", value: "any" },
  { label: "已全部分发", value: "all" },
  { label: "有未分发", value: "missing" },
];

/**
 * Filters by which tools a skill is distributed into.
 *
 * Pick the tools, then pick an outcome. The tool picker is a dropdown because
 * the registry holds ~19 tools; the three outcomes are chips to stay consistent
 * with the source and status filters above.
 *
 * With no tool chosen the chips are hidden rather than shown disabled: an empty
 * selection means the axis is not filtering, and zeroed chips would read as
 * answers instead of an unset question.
 */
export function DistributionFilter({
  counts,
  match,
  onMatchChange,
  onToolIdsChange,
  toolIds,
  tools,
}: {
  counts: Record<SkillDistributionMatch, number>;
  match: SkillDistributionMatch;
  onMatchChange: (match: SkillDistributionMatch) => void;
  onToolIdsChange: (toolIds: string[]) => void;
  toolIds: string[];
  tools: ToolOption[];
}) {
  const toggleTool = (toolId: string, checked: boolean) => {
    onToolIdsChange(
      checked ? [...toolIds, toolId] : toolIds.filter((id) => id !== toolId),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-foreground/70">分发</span>

      {tools.length === 0 ? (
        <Button disabled size="sm" variant="outline">
          <ListFilter data-icon="inline-start" />
          选择工具
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <ListFilter data-icon="inline-start" />
              {toolIds.length === 0 ? "选择工具" : `${toolIds.length} 个工具`}
              <ChevronDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel>按分发到的工具筛选</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {tools.map((tool) => (
              <DropdownMenuCheckboxItem
                checked={toolIds.includes(tool.id)}
                key={tool.id}
                // Keep the menu open so several tools can be picked in one go,
                // which is the whole point of the multi-select.
                onCheckedChange={(checked) =>
                  toggleTool(tool.id, checked === true)
                }
                onSelect={(event) => event.preventDefault()}
              >
                {tool.label}
              </DropdownMenuCheckboxItem>
            ))}
            {toolIds.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onToolIdsChange([])}>
                  <X />
                  清除已选工具
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {toolIds.length > 0 ? (
        <ToggleGroup
          aria-label="按分发范围筛选"
          onValueChange={(value) => {
            // Radix reports "" when the active chip is clicked again. An
            // outcome always applies once tools are chosen, so an empty value
            // is ignored rather than silently widening the filter.
            if (value) onMatchChange(value as SkillDistributionMatch);
          }}
          size="sm"
          type="single"
          value={match}
        >
          {MATCH_MODES.map(({ label, value }) => (
            <ToggleGroupItem
              aria-label={`${label}（${counts[value]}）`}
              // `any` is never disabled, matching the source and status rows:
              // it is the way back out, so it must stay reachable even when it
              // is the only mode with a non-zero count.
              disabled={value !== "any" && counts[value] === 0}
              key={value}
              value={value}
            >
              {label}
              {/* Inherits the chip's own foreground at reduced opacity,
                  matching the source and status chips. */}
              <span className="tabular-nums opacity-80">{counts[value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
    </div>
  );
}
