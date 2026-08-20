import { describe, expect, it } from "vitest";

import { groupByAuthor, filterAndSortSkills } from "./selectors";
import type { InstalledSkill } from "./types";

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
    versionHistory: [],
    ...overrides,
  };
}

describe("skill selectors", () => {
  it("filters by search, source, and update status without mutating input", () => {
    const skills = [
      skill({ id: "local/notes", name: "notes", source: "local://notes", installedAt: "1" }),
      skill({ id: "remote/docs", name: "docs", description: "Writing tools", installedAt: "2" }),
    ];
    const updates = new Map([
      ["remote/docs", { id: "remote/docs", currentVersion: "a", currentHash: "a", latestVersion: "b", latestHash: "b", updateAvailable: true }],
    ]);

    const result = filterAndSortSkills(skills, updates, {
      search: "writing",
      source: "skills.sh",
      status: "update",
      sort: "recent",
    });

    expect(result.map((item) => item.id)).toEqual(["remote/docs"]);
    expect(skills.map((item) => item.id)).toEqual(["local/notes", "remote/docs"]);
  });

  it("sorts recent skills newest first and groups them by author", () => {
    const skills = [
      skill({ id: "a/old", owner: "a", name: "old", installedAt: "10" }),
      skill({ id: "b/new", owner: "b", name: "new", installedAt: "20" }),
      skill({ id: "a/latest", owner: "a", name: "latest", installedAt: "30" }),
    ];

    const sorted = filterAndSortSkills(skills, new Map(), {
      search: "",
      source: "all",
      status: "all",
      sort: "recent",
    });

    expect(sorted.map((item) => item.name)).toEqual(["latest", "new", "old"]);
    expect(groupByAuthor(sorted).map(([owner, items]) => [owner, items.map((item) => item.name)])).toEqual([
      ["a", ["latest", "old"]],
      ["b", ["new"]],
    ]);
  });
});
