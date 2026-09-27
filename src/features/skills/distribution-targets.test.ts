import { describe, expect, it } from "vitest";
import { distributionTargetsFor } from "./hooks";
import type { InstalledSkill, ToolOption } from "./types";

function skill(overrides: Partial<InstalledSkill>): InstalledSkill {
  return {
    id: "owner/repo/skill",
    name: "skill",
    owner: "owner",
    repo: "repo",
    source: "https://skills.sh/owner/repo/skill",
    description: "A test skill",
    currentVersion: "abc123",
    currentHash: "hash",
    installedAt: "0",
    distributedTo: [],
    ...overrides,
  };
}

// `tools` here is the backend's `distributableTools`, which already excludes
// tools that read the shared directory. This is the list the row menu renders,
// so a shared-reading tool cannot appear in 分发到工具.
const TOOLS: ToolOption[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codebuddy", label: "CodeBuddy / WorkBuddy" },
  { id: "codex", label: "OpenAI Codex CLI" },
];

describe("distributionTargetsFor", () => {
  it("offers only tools detected on this machine", () => {
    const targets = distributionTargetsFor(TOOLS, ["claude-code"], skill({}));
    expect(targets.map((t) => t.id)).toEqual(["claude-code"]);
  });

  it("keeps a tool that holds a link even when it is no longer detected", () => {
    // An uninstalled tool can leave a link behind; the row must still offer a
    // way to remove it rather than silently hiding the stale link.
    const targets = distributionTargetsFor(
      TOOLS,
      ["claude-code"],
      skill({ distributedTo: ["codex"] }),
    );
    expect(targets.map((t) => t.id).sort()).toEqual(["claude-code", "codex"]);
  });

  it("never returns a tool that is absent from the distributable list", () => {
    // Cursor and Copilot read the shared directory, so the backend omits them
    // from `distributableTools`. They must not appear even if something claims
    // they are detected.
    const targets = distributionTargetsFor(
      TOOLS,
      ["claude-code", "cursor", "copilot"],
      skill({}),
    );
    expect(targets.map((t) => t.id)).not.toContain("cursor");
    expect(targets.map((t) => t.id)).not.toContain("copilot");
    expect(targets).toHaveLength(1);
  });

  it("returns nothing when no tool needs its own copy", () => {
    expect(distributionTargetsFor(TOOLS, [], skill({}))).toEqual([]);
  });
});
