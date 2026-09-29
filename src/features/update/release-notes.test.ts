import { describe, expect, it } from "vitest";

import { parseInline, parseReleaseNotes } from "./release-notes";

describe("parseReleaseNotes", () => {
  it("keeps one list together across the blank lines our notes use", () => {
    // Every bullet in docs/releases/*.md is separated by a blank line. Treating
    // that as the end of the list turned one section into a dozen one-item
    // lists, which then rendered with uneven spacing between bullets.
    const blocks = parseReleaseNotes(
      "- first\n\n- second\n\n- third\n",
    );
    expect(blocks).toEqual([
      { kind: "list", items: ["first", "second", "third"] },
    ]);
  });

  it("folds an indented line into the bullet above it", () => {
    // The English translation is indented under the Chinese line; losing the
    // newline would run the two languages together into one sentence.
    const blocks = parseReleaseNotes("- 中文说明。\n  English line.\n");
    expect(blocks).toEqual([
      { kind: "list", items: ["中文说明。\nEnglish line."] },
    ]);
  });

  it("clamps every heading level so a note cannot out-shout the page", () => {
    const blocks = parseReleaseNotes("# One\n## Two\n### Three\n");
    expect(blocks.map((b) => (b.kind === "heading" ? b.level : null))).toEqual([
      2, 2, 3,
    ]);
  });

  it("returns untrusted markup as inert text", () => {
    // The manifest is not covered by the installer's minisign signature, so a
    // mirror that wins the race controls this string. It must reach the DOM
    // only as a text node.
    const blocks = parseReleaseNotes(
      "- <img src=x onerror=alert(1)>\n- <script>alert(2)</script>\n",
    );
    expect(blocks).toEqual([
      {
        kind: "list",
        items: ["<img src=x onerror=alert(1)>", "<script>alert(2)</script>"],
      },
    ]);
  });

  it("keeps unrecognized text instead of dropping it", () => {
    const blocks = parseReleaseNotes("Just a sentence.\n");
    expect(blocks).toEqual([{ kind: "text", text: "Just a sentence." }]);
  });

  it("handles CRLF and an empty body", () => {
    expect(parseReleaseNotes("- a\r\n- b\r\n")).toEqual([
      { kind: "list", items: ["a", "b"] },
    ]);
    expect(parseReleaseNotes("")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("splits bold runs so the markers never render literally", () => {
    expect(parseInline("**Windows**：NSIS 安装包。")).toEqual([
      { bold: true, text: "Windows" },
      { bold: false, text: "：NSIS 安装包。" },
    ]);
  });

  it("leaves a single asterisk alone", () => {
    // Our notes use `*` inside prose far more often than as emphasis.
    expect(parseInline("a * b")).toEqual([{ bold: false, text: "a * b" }]);
  });

  it("returns one plain run when there is nothing to split", () => {
    expect(parseInline("plain")).toEqual([{ bold: false, text: "plain" }]);
  });
});
