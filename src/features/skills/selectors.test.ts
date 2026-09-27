import { describe, expect, it } from "vitest";

import {
  countSkillsBySource,
  countSkillsByStatus,
  filterAndSortSkills,
  isRemoteUpdateable,
  searchSkills,
  sourceKindOf,
  statusKindOf,
} from "./selectors";
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

const update = (id: string, updateAvailable: boolean): UpdateInfo => ({
  id,
  currentVersion: "a",
  currentHash: "a",
  latestVersion: "b",
  latestHash: "b",
  updateAvailable,
});

describe("skill selectors", () => {
  it("classifies sources into remote, local, and builtin", () => {
    expect(sourceKindOf(skill({ source: "https://skills.sh/a/b/c" }))).toBe(
      "remote",
    );
    expect(sourceKindOf(skill({ source: "local://notes" }))).toBe("local");
    expect(sourceKindOf(skill({ source: "builtin://fixture" }))).toBe(
      "builtin",
    );
  });

  it("only treats backend-supported hosts as updateable", () => {
    expect(isRemoteUpdateable(skill({ source: "https://skills.sh/a/b/c" }))).toBe(
      true,
    );
    expect(
      isRemoteUpdateable(skill({ source: "https://github.com/a/b" })),
    ).toBe(true);
    expect(
      isRemoteUpdateable(
        skill({ source: "https://raw.githubusercontent.com/a/b/c/SKILL.md" }),
      ),
    ).toBe(true);
    // Local, builtin, and unrecognized hosts have no remote to compare against.
    expect(isRemoteUpdateable(skill({ source: "local://notes" }))).toBe(false);
    expect(isRemoteUpdateable(skill({ source: "builtin://x" }))).toBe(false);
    expect(isRemoteUpdateable(skill({ source: "https://example.com/a" }))).toBe(
      false,
    );
  });

  it("reports local and builtin skills as having no update source", () => {
    const updates = new Map([["local/notes", update("local/notes", true)]]);
    // Even with a stray update entry, a local skill has no update channel.
    expect(statusKindOf(skill({ source: "local://notes" }), updates)).toBe(
      "no-source",
    );
    expect(
      statusKindOf(
        skill({ id: "a/b/c", source: "https://skills.sh/a/b/c" }),
        updates,
      ),
    ).toBe("current");
    expect(
      statusKindOf(
        skill({ id: "a/b/c", source: "https://skills.sh/a/b/c" }),
        new Map([["a/b/c", update("a/b/c", true)]]),
      ),
    ).toBe("update");
  });

  it("counts facets over the search-only set", () => {
    const skills = [
      skill({ id: "r/1", source: "https://skills.sh/r/1", name: "alpha" }),
      skill({ id: "local/2", source: "local://beta", name: "beta" }),
      skill({ id: "builtin/3", source: "builtin://gamma", name: "gamma" }),
    ];

    expect(countSkillsBySource(skills)).toEqual({
      all: 3,
      remote: 1,
      local: 1,
      builtin: 1,
    });

    const searched = searchSkills(skills, "beta");
    expect(searched.map((item) => item.name)).toEqual(["beta"]);
    expect(countSkillsBySource(searched)).toEqual({
      all: 1,
      remote: 0,
      local: 1,
      builtin: 0,
    });
    expect(countSkillsByStatus(searched, new Map())).toEqual({
      all: 1,
      update: 0,
      current: 0,
      "no-source": 1,
    });
  });

  it("filters by source, status, and search without mutating input", () => {
    const skills = [
      skill({
        id: "local/notes",
        name: "notes",
        source: "local://notes",
        installedAt: "1",
      }),
      skill({
        id: "remote/docs",
        name: "docs",
        source: "https://skills.sh/remote/docs",
        description: "Writing tools",
        installedAt: "2",
      }),
    ];
    const updates = new Map([["remote/docs", update("remote/docs", true)]]);

    const result = filterAndSortSkills(skills, updates, {
      direction: "desc",
      search: "writing",
      source: "remote",
      status: "update",
      sort: "recent",
    });

    expect(result.map((item) => item.id)).toEqual(["remote/docs"]);
    expect(skills.map((item) => item.id)).toEqual([
      "local/notes",
      "remote/docs",
    ]);
  });

  it("can isolate the skills that have no update source", () => {
    const skills = [
      skill({ id: "local/a", source: "local://a", name: "a" }),
      skill({ id: "remote/b", source: "https://skills.sh/b/c", name: "b" }),
    ];
    const result = filterAndSortSkills(skills, new Map(), {
      direction: "desc",
      search: "",
      source: "all",
      status: "no-source",
      sort: "recent",
    });
    expect(result.map((item) => item.id)).toEqual(["local/a"]);
  });

  it("sorts by name and by date in both directions", () => {
    const skills = [
      skill({ id: "a/old", owner: "a", name: "old", installedAt: "10" }),
      skill({ id: "b/new", owner: "b", name: "new", installedAt: "20" }),
      skill({ id: "a/latest", owner: "a", name: "latest", installedAt: "30" }),
    ];

    const byDateDesc = filterAndSortSkills(skills, new Map(), {
      direction: "desc",
      search: "",
      source: "all",
      status: "all",
      sort: "recent",
    });
    expect(byDateDesc.map((item) => item.name)).toEqual([
      "latest",
      "new",
      "old",
    ]);

    const byDateAsc = filterAndSortSkills(skills, new Map(), {
      direction: "asc",
      search: "",
      source: "all",
      status: "all",
      sort: "recent",
    });
    expect(byDateAsc.map((item) => item.name)).toEqual([
      "old",
      "new",
      "latest",
    ]);

    const byNameAsc = filterAndSortSkills(skills, new Map(), {
      direction: "asc",
      search: "",
      source: "all",
      status: "all",
      sort: "name",
    });
    expect(byNameAsc.map((item) => item.name)).toEqual([
      "latest",
      "new",
      "old",
    ]);

    const byNameDesc = filterAndSortSkills(skills, new Map(), {
      direction: "desc",
      search: "",
      source: "all",
      status: "all",
      sort: "name",
    });
    expect(byNameDesc.map((item) => item.name)).toEqual([
      "old",
      "new",
      "latest",
    ]);
  });

  it("breaks timestamp ties by author so author groups stay contiguous", () => {
    const skills = [
      skill({ id: "b/x", owner: "b", name: "x", installedAt: "5" }),
      skill({ id: "a/y", owner: "a", name: "y", installedAt: "5" }),
      skill({ id: "a/z", owner: "a", name: "z", installedAt: "5" }),
    ];
    const sorted = filterAndSortSkills(skills, new Map(), {
      direction: "desc",
      search: "",
      source: "all",
      status: "all",
      sort: "recent",
    });
    expect(sorted.map((item) => item.owner)).toEqual(["a", "a", "b"]);
  });

  it("normalizes mixed second and millisecond timestamps", () => {
    // A unix-seconds string and an ISO date must order correctly against each
    // other rather than one unit dwarfing the other.
    const skills = [
      skill({ id: "a/iso", name: "iso", installedAt: "2026-01-02T00:00:00Z" }),
      skill({ id: "b/sec", name: "sec", installedAt: "1767225600" }),
    ];
    const sorted = filterAndSortSkills(skills, new Map(), {
      direction: "desc",
      search: "",
      source: "all",
      status: "all",
      sort: "recent",
    });
    // 1767225600 == 2026-01-01T00:00:00Z, which is older than 2026-01-02.
    expect(sorted.map((item) => item.name)).toEqual(["iso", "sec"]);
  });
});
