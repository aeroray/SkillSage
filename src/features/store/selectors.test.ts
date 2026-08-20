import { describe, expect, it } from "vitest";

import { groupByRepository } from "./selectors";
import type { SkillSearchResult } from "./types";

function result(overrides: Partial<SkillSearchResult>): SkillSearchResult {
  return {
    id: "owner/repo/skill",
    slug: "skill",
    name: "skill",
    source: "owner/repo",
    installs: 1,
    sourceType: "GitHub",
    url: "https://skills.sh/owner/repo/skill",
    isDuplicate: false,
    ...overrides,
  };
}

describe("store selectors", () => {
  it("keeps the first skill as the primary and groups later skills by repository", () => {
    const groups = groupByRepository([
      result({ id: "owner/repo/first", name: "first" }),
      result({ id: "owner/repo/second", name: "second" }),
      result({ source: "other/repo", id: "other/repo/only", name: "only" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].primary.name).toBe("first");
    expect(groups[0].additional.map((item) => item.name)).toEqual(["second"]);
    expect(groups[1].primary.name).toBe("only");
  });
});
