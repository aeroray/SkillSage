import { Languages, LoaderCircle } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export type DescriptionMode = "original" | "translated";

type SkillDescriptionPanelProps = {
  description: string;
  descriptionMode: DescriptionMode;
  onDescriptionModeChange: (mode: DescriptionMode) => void;
  onTranslate: () => void;
  translatedDescription?: string;
  translationError?: string;
  translationLoading: boolean;
};

export function SkillDescriptionPanel({
  description,
  descriptionMode,
  onDescriptionModeChange,
  onTranslate,
  translatedDescription,
  translationError,
  translationLoading,
}: SkillDescriptionPanelProps) {
  const hasDescription = description.trim().length > 0;
  const displayedDescription =
    descriptionMode === "translated"
      ? translatedDescription ?? description
      : description;

  return (
    <section
      aria-busy={translationLoading}
      aria-labelledby="description-title"
      className="rounded-lg border border-border bg-muted/20 p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3
            className="text-sm font-medium text-foreground"
            id="description-title"
          >
            技能说明
          </h3>
          <Badge variant="muted">
            {descriptionMode === "translated" ? "AI 译文" : "原文"}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {translatedDescription ? (
            <Select
              onValueChange={(value) =>
                onDescriptionModeChange(value as DescriptionMode)
              }
              value={descriptionMode}
            >
              <SelectTrigger aria-label="选择技能说明语言" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="translated">译文</SelectItem>
                <SelectItem value="original">原文</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <Button
            aria-label={
              translatedDescription ? "重新翻译技能说明" : "翻译技能说明"
            }
            disabled={!hasDescription || translationLoading}
            onClick={onTranslate}
            size="sm"
            variant="outline"
          >
            {translationLoading ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Languages aria-hidden="true" />
            )}
            {translatedDescription ? "重新翻译" : "翻译说明"}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {displayedDescription || "暂无描述"}
      </p>
      {translationError ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {translationError}
        </p>
      ) : null}
    </section>
  );
}
