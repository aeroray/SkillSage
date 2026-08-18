import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { FieldDescription, FieldSet, FieldLegend } from "../ui/field";

export type ToolOption = {
  id: string;
  name: string;
  detected: boolean;
};

type ToolSelectionProps = {
  agents: string[];
  disabled?: boolean;
  onToggle: (id: string, checked: boolean) => void;
  tools: ToolOption[];
};

export function ToolSelection({ agents, disabled, onToggle, tools }: ToolSelectionProps) {
  return (
    <FieldSet>
      <FieldLegend variant="label">分发到工具</FieldLegend>
      <FieldDescription>选择要使用这个技能的工具。</FieldDescription>
      <div className="grid grid-cols-2 gap-2">
        {tools.map((tool) => (
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 transition-colors hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60" key={tool.id}>
            <span className="flex items-center gap-3">
              <Checkbox checked={agents.includes(tool.id)} disabled={disabled} onCheckedChange={(checked) => onToggle(tool.id, checked === true)} />
              <span className="text-sm text-foreground">{tool.name}</span>
            </span>
            {tool.detected ? <Badge variant="success">已找到</Badge> : <Badge variant="muted">未找到</Badge>}
          </label>
        ))}
      </div>
    </FieldSet>
  );
}
