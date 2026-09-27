import { describe, expect, it } from "vitest";

import {
  clearCachedDetail,
  clearCachedLeaderboard,
  getCachedDetail,
  getCachedLeaderboard,
  setCachedDetail,
  setCachedLeaderboard,
} from "./cache";
import type { SkillDetail, SkillSearchResult } from "./types";

function detail(id: string): SkillDetail {
  return {
    id,
    source: "owner/repo",
    slug: id,
    name: id,
    description: "d",
    installs: 1,
    url: `https://www.skills.sh/${id}`,
    audits: [],
  };
}

function result(id: string): SkillSearchResult {
  return {
    id,
    slug: id,
    name: id,
    source: "owner/repo",
    installs: 1,
    sourceType: "github",
    url: `https://www.skills.sh/${id}`,
    isDuplicate: false,
  };
}

describe("store cache", () => {
  it("returns copies so a caller cannot mutate the cached leaderboard", () => {
    setCachedLeaderboard("hot", [result("a")]);
    const first = getCachedLeaderboard("hot");
    first?.push(result("b"));
    expect(getCachedLeaderboard("hot")).toHaveLength(1);
    clearCachedLeaderboard("hot");
  });

  it("caches detail per skill and clears individually", () => {
    setCachedDetail("owner/repo/a", detail("a"));
    setCachedDetail("owner/repo/b", detail("b"));
    expect(getCachedDetail("owner/repo/a")?.name).toBe("a");
    clearCachedDetail("owner/repo/a");
    expect(getCachedDetail("owner/repo/a")).toBeUndefined();
    // Clearing one must not disturb another.
    expect(getCachedDetail("owner/repo/b")?.name).toBe("b");
    clearCachedDetail("owner/repo/b");
  });

  it("evicts the least recently used detail once over the bound", () => {
    // The bound exists so a long session does not retain every parsed page.
    const ids = Array.from({ length: 60 }, (_, i) => `owner/repo/s${i}`);
    ids.forEach((id) => setCachedDetail(id, detail(id)));

    // The newest entries survive; the oldest were evicted.
    expect(getCachedDetail(ids[59])).toBeDefined();
    expect(getCachedDetail(ids[0])).toBeUndefined();

    // Reading an old-but-live entry must protect it from the next eviction.
    const survivor = ids[30];
    expect(getCachedDetail(survivor)).toBeDefined();
    setCachedDetail("owner/repo/newest", detail("newest"));
    expect(getCachedDetail(survivor)).toBeDefined();

    ids.forEach(clearCachedDetail);
    clearCachedDetail("owner/repo/newest");
  });
});
