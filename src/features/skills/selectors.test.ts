import { describe, expect, it } from "vitest";

import {
  countSkillsByDistribution,
  countSkillsBySource,
  countSkillsByStatus,
  filterAndSortSkills,
  isRemoteUpdateable,
  matchesDistribution,
  searchSkills,
  sourceKindOf,
  statusKindOf,
  type SkillDistributionMatch,
  type SkillFilters,
} from "./selectors";
import type { InstalledSkill, UpdateInfo } from "./types";

/** The default filters, so each test states only the axis it is exercising. */
function filters(overrides: Partial<SkillFilters> = {}): SkillFilters {
  return {
    direction: "desc",
    search: "",
    sort: "recent",
    source: "all",
    status: "all",
    distribution: { match: "any", toolIds: [] },
    ...overrides,
  };
}

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

    const result = filterAndSortSkills(
      skills,
      updates,
      filters({ search: "writing", source: "remote", status: "update" }),
    );

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
    const result = filterAndSortSkills(
      skills,
      new Map(),
      filters({ status: "no-source" }),
    );
    expect(result.map((item) => item.id)).toEqual(["local/a"]);
  });

  it("sorts by name and by date in both directions", () => {
    const skills = [
      skill({ id: "a/old", owner: "a", name: "old", installedAt: "10" }),
      skill({ id: "b/new", owner: "b", name: "new", installedAt: "20" }),
      skill({ id: "a/latest", owner: "a", name: "latest", installedAt: "30" }),
    ];

    const byDateDesc = filterAndSortSkills(skills, new Map(), filters());
    expect(byDateDesc.map((item) => item.name)).toEqual([
      "latest",
      "new",
      "old",
    ]);

    const byDateAsc = filterAndSortSkills(
      skills,
      new Map(),
      filters({ direction: "asc" }),
    );
    expect(byDateAsc.map((item) => item.name)).toEqual([
      "old",
      "new",
      "latest",
    ]);

    const byNameAsc = filterAndSortSkills(
      skills,
      new Map(),
      filters({ direction: "asc", sort: "name" }),
    );
    expect(byNameAsc.map((item) => item.name)).toEqual([
      "latest",
      "new",
      "old",
    ]);

    const byNameDesc = filterAndSortSkills(
      skills,
      new Map(),
      filters({ sort: "name" }),
    );
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
    const sorted = filterAndSortSkills(skills, new Map(), filters());
    expect(sorted.map((item) => item.owner)).toEqual(["a", "a", "b"]);
  });

  it("normalizes mixed second and millisecond timestamps", () => {
    // A unix-seconds string and an ISO date must order correctly against each
    // other rather than one unit dwarfing the other.
    const skills = [
      skill({ id: "a/iso", name: "iso", installedAt: "2026-01-02T00:00:00Z" }),
      skill({ id: "b/sec", name: "sec", installedAt: "1767225600" }),
    ];
    const sorted = filterAndSortSkills(skills, new Map(), filters());
    // 1767225600 == 2026-01-01T00:00:00Z, which is older than 2026-01-02.
    expect(sorted.map((item) => item.name)).toEqual(["iso", "sec"]);
  });

  describe("distribution filter", () => {
    const TOOLS = ["claude", "codex"];
    const onlyClaudeAndCodex = skill({
      id: "a/both",
      name: "both",
      distributedTo: ["claude", "codex"],
    });
    const onlyClaude = skill({
      id: "a/claude",
      name: "claude-only",
      distributedTo: ["claude"],
    });
    const neither = skill({
      id: "a/none",
      name: "neither",
      distributedTo: [],
    });
    const otherTool = skill({
      id: "a/other",
      name: "other-tool",
      distributedTo: ["cursor"],
    });
    const all = [onlyClaudeAndCodex, onlyClaude, neither, otherTool];

    const matching = (match: SkillDistributionMatch) =>
      all
        .filter((item) => matchesDistribution(item, { match, toolIds: TOOLS }))
        .map((item) => item.name);

    it("`any` is the escape hatch and filters nothing", () => {
      // It exists so picking tools does not drop straight into an outcome that
      // is usually empty, which would read as a broken filter.
      expect(matching("any")).toEqual([
        "both",
        "claude-only",
        "neither",
        "other-tool",
      ]);
    });

    it("`all` selects skills distributed to every selected tool", () => {
      // "已全部分发": in Claude Code and in Codex.
      expect(matching("all")).toEqual(["both"]);
    });

    it("`missing` selects skills not distributed to every selected tool", () => {
      // "有未分发": missing from at least one of them. `claude-only` is the
      // interesting case — it is linked into one selected tool but not the
      // other, so it is incomplete rather than done.
      expect(matching("missing")).toEqual([
        "claude-only",
        "neither",
        "other-tool",
      ]);
    });

    it("`all` and `missing` partition the list exactly", () => {
      // Every skill is in exactly one of the two, so the counts always sum to
      // the total and no skill can be hidden by both.
      const all = matching("all");
      const missing = matching("missing");
      expect(all.length + missing.length).toBe(4);
      expect(all.filter((name) => missing.includes(name))).toEqual([]);
    });

    it("an empty tool selection does not filter anything", () => {
      // Clearing the tools must restore the full list rather than hiding every
      // skill, which "distributed to none of nothing" would do.
      for (const match of [
        "any",
        "all",
        "missing",
      ] as SkillDistributionMatch[]) {
        expect(
          all.filter((item) =>
            matchesDistribution(item, { match, toolIds: [] }),
          ),
        ).toHaveLength(all.length);
      }
    });

    it("a single selected tool needs only that one link", () => {
      const one = { toolIds: ["claude"] };
      expect(
        all
          .filter((item) => matchesDistribution(item, { match: "all", ...one }))
          .map((item) => item.name),
      ).toEqual(["both", "claude-only"]);
    });

    it("composes with the other filters", () => {
      const skills = [
        skill({
          id: "a/remote-both",
          name: "remote-both",
          source: "https://skills.sh/a/b",
          distributedTo: TOOLS,
        }),
        skill({
          id: "a/local-both",
          name: "local-both",
          source: "local://x",
          distributedTo: TOOLS,
        }),
      ];
      const result = filterAndSortSkills(
        skills,
        new Map(),
        filters({ source: "remote", distribution: { match: "all", toolIds: TOOLS } }),
      );
      expect(result.map((item) => item.name)).toEqual(["remote-both"]);
    });

    it("counts each mode over the given set", () => {
      const counts = countSkillsByDistribution(all, TOOLS);
      expect(counts).toEqual({ any: 4, all: 1, missing: 3 });
      // The two outcome counts partition the set, which is what makes them
      // trustworthy, and `any` is always the whole set.
      expect(counts.all + counts.missing).toBe(all.length);
      expect(counts.any).toBe(all.length);
      // With no tools chosen every count is zero, which is what keeps the
      // chips hidden rather than showing zeroes as if they were answers.
      expect(countSkillsByDistribution(all, [])).toEqual({
        any: 0,
        all: 0,
        missing: 0,
      });
    });
  });
});
