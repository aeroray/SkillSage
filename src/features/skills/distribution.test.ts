import { describe, expect, it } from "vitest";
import { countSkillsByStatus, statusKindOf } from "./selectors";
import type { InstalledSkill, UpdateInfo } from "./types";

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

describe("distribution state", () => {
  it("treats a skill with no links as distributed nowhere", () => {
    const record = skill({ distributedTo: [] });
    expect(record.distributedTo).toHaveLength(0);
  });

  it("carries one entry per linked tool", () => {
    const record = skill({ distributedTo: ["claude-code", "codebuddy"] });
    expect(record.distributedTo).toContain("claude-code");
    expect(record.distributedTo).toContain("codebuddy");
    // A tool that reads the shared directory never appears.
    expect(record.distributedTo).not.toContain("cursor");
  });
});

describe("status classification", () => {
  const none = new Map<string, UpdateInfo>();

  it("reports a local skill as having no update source rather than up to date", () => {
    expect(statusKindOf(skill({ source: "local://notes" }), none)).toBe(
      "no-source",
    );
    expect(statusKindOf(skill({ source: "builtin://fixture" }), none)).toBe(
      "no-source",
    );
  });

  it("reports a remote skill with a pending update as needing one", () => {
    const update: UpdateInfo = {
      id: "owner/repo/skill",
      currentVersion: "1",
      currentHash: "h",
      latestVersion: "2",
      latestHash: "h2",
      updateAvailable: true,
    };
    expect(
      statusKindOf(
        skill({ source: "https://skills.sh/o/r/s" }),
        new Map([["owner/repo/skill", update]]),
      ),
    ).toBe("update");
  });
});

describe("status counts", () => {
  it("counts skills with no remote source separately from up-to-date ones", () => {
    const updates = new Map<string, UpdateInfo>([
      ["a", { id: "a", currentVersion: "1", currentHash: "h", latestVersion: "2", latestHash: "h2", updateAvailable: true }],
    ]);
    const counts = countSkillsByStatus(
      [
        skill({ id: "a", source: "https://skills.sh/o/r/a" }),
        skill({ id: "b", source: "https://skills.sh/o/r/b" }),
        skill({ id: "c", source: "local://notes" }),
      ],
      updates,
    );
    expect(counts.all).toBe(3);
    expect(counts.update).toBe(1);
    // "b" is remote and has no recorded update, so it counts as up to date.
    expect(counts.current).toBe(1);
    // "c" is local: its update state is unknowable, not "up to date".
    expect(counts["no-source"]).toBe(1);
  });
});
