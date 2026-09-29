import * as React from "react";

import { cn } from "../../lib/utils";
import { parseInline, parseReleaseNotes } from "./release-notes";

/** Renders `**bold**` runs. Every value is a plain string, so React escapes it. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((run, index) =>
        run.bold ? (
          <strong className="font-medium text-foreground" key={index}>
            {run.text}
          </strong>
        ) : (
          <React.Fragment key={index}>{run.text}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * Renders the update manifest's release notes.
 *
 * Everything is a React element built from parsed strings — see
 * `release-notes.ts` for why this must never become `dangerouslySetInnerHTML`.
 * The manifest is unsigned, so a mirror that wins the race controls this text.
 */
export function ReleaseNotes({
  className,
  markdown,
}: {
  className?: string;
  markdown: string;
}) {
  const blocks = React.useMemo(() => parseReleaseNotes(markdown), [markdown]);

  if (blocks.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          // Headings are keyed by position because the same words can repeat
          // (e.g. a translated title) and are not unique identifiers.
          return block.level === 2 ? (
            <p className="text-sm font-semibold text-foreground" key={index}>
              <Inline text={block.text} />
            </p>
          ) : (
            <p
              className="mt-1 text-xs font-medium text-muted-foreground"
              key={index}
            >
              <Inline text={block.text} />
            </p>
          );
        }
        if (block.kind === "list") {
          return (
            <ul className="flex flex-col gap-2" key={index}>
              {block.items.map((item, itemIndex) => (
                <li
                  className="flex gap-2 text-sm leading-5 text-muted-foreground"
                  key={itemIndex}
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/40"
                  />
                  {/* The note keeps its authored newline between the Chinese
                      line and its English translation. */}
                  <span className="min-w-0 whitespace-pre-line">
                    <Inline text={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p className="text-sm leading-5 text-muted-foreground" key={index}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
