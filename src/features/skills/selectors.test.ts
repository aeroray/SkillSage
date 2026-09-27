import { describe, expect, it } from "vitest";

import {
  countSkillsBySource,
  countSkillsByStatus,
  filterAndSortSkills,
  isRemoteUpdateable,
  matchesDistribution,
  searchSkills,
  sourceKindOf,
  statusKindOf,
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
    distribution: { inverted: false, toolIds: [] },
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

    const matching = (inverted: boolean) =>
      all
        .filter((item) => matchesDistribution(item, { inverted, toolIds: TOOLS }))
        .map((item) => item.name);

    it("selecting several tools is a union", () => {
      // "Show me what I put in these tools" 閳?being in either one qualifies.
      // `other-tool` is only in Cursor, which is not selected, so it is out.
      expect(matching(false)).toEqual(["both", "claude-only"]);
    });

    it("inverting asks the opposite question", () => {
      // "What have I not put in these tools" 閳?this is the user's original
      // request to find skills missing from a set of tools, and it includes
      // skills in no tool at all as well as ones only in an unselected tool.
      expect(matching(true)).toEqual(["neither", "other-tool"]);
    });

    it("the two directions partition the list exactly", () => {
      // Every skill is in exactly one direction, so the counts always sum to
      // the total and no skill can be hidden by both.
      const forward = matching(false);
      const backward = matching(true);
      expect(forward.length + backward.length).toBe(4);
      expect(forward.filter((name) => backward.includes(name))).toEqual([]);
    });

    it("an empty tool selection does not filter anything", () => {
      // Clearing the tools must restore the full list rather than hiding every
      // skill, which "distributed to none of nothing" would do 閳?and that
      // applies to the inverted direction too.
      for (const inverted of [false, true]) {
        expect(
          all.filter((item) =>
            matchesDistribution(item, { inverted, toolIds: [] }),
          ),
        ).toHaveLength(all.length);
      }
    });

    it("a single selected tool needs only that one link", () => {
      expect(
        all
          .filter((item) =>
            matchesDistribution(item, { inverted: false, toolIds: ["claude"] }),
          )
          .map((item) => item.name),
      ).toEqual(["both", "claude-only"]);
      // Inverting that one tool is the "not in Claude Code" question.
      expect(
        all
          .filter((item) =>
            matchesDistribution(item, { inverted: true, toolIds: ["claude"] }),
          )
          .map((item) => item.name),
      ).toEqual(["neither", "other-tool"]);
    });

    it("composes with the other filters", () => {
      const skills = [
        skill({
          id: "a/remote-both",
          name: "remote-both",
          source: "https://skills.sh/a/b",
          distributedTo: ["claude"],
        }),
        skill({
          id: "a/local-both",
          name: "local-both",
          source: "local://x",
          distributedTo: ["claude"],
        }),
      ];
      const result = filterAndSortSkills(
        skills,
        new Map(),
        filters({
          source: "remote",
          distribution: { inverted: false, toolIds: ["claude"] },
        }),
      );
      expect(result.map((item) => item.name)).toEqual(["remote-both"]);
    });

    it("the two directions partition the set, so inverting hides nothing", () => {
      // Every skill is in exactly one direction, which is what makes the
      // invert toggle safe to use as a way of looking at the complement.
      expect(matching(false).length + matching(true).length).toBe(all.length);
    });
  });
});
