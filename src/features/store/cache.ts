import type { LeaderboardRange, SkillDetail, SkillSearchResult } from "./types";

const leaderboardCache = new Map<LeaderboardRange, SkillSearchResult[]>();

export function getCachedLeaderboard(range: LeaderboardRange) {
  return leaderboardCache.get(range)?.slice();
}

export function setCachedLeaderboard(range: LeaderboardRange, skills: SkillSearchResult[]) {
  leaderboardCache.set(range, skills.slice());
}

export function clearCachedLeaderboard(range: LeaderboardRange) {
  leaderboardCache.delete(range);
}

/**
 * Detail pages, keyed by skill id.
 *
 * Opening a skill fetches and HTML-parses its skills.sh page, which is the most
 * expensive store request there is. Without this, closing the dialog and
 * reopening the same skill — or bouncing between the two skills of one
 * repository — re-fetched and re-parsed each time.
 *
 * Bounded because a long browsing session would otherwise retain every page it
 * had ever parsed; the value is a small struct, but the map is unbounded by
 * nature and this is the only place that knows the access pattern.
 */
const MAX_CACHED_DETAILS = 50;
const detailCache = new Map<string, SkillDetail>();

export function getCachedDetail(skillId: string) {
  const cached = detailCache.get(skillId);
  if (!cached) return undefined;
  // Refresh recency so the eviction below drops the least recently *used*
  // entry rather than the least recently fetched.
  detailCache.delete(skillId);
  detailCache.set(skillId, cached);
  return cached;
}

export function setCachedDetail(skillId: string, detail: SkillDetail) {
  detailCache.delete(skillId);
  detailCache.set(skillId, detail);
  while (detailCache.size > MAX_CACHED_DETAILS) {
    const oldest = detailCache.keys().next();
    if (oldest.done) break;
    detailCache.delete(oldest.value);
  }
}

export function clearCachedDetail(skillId: string) {
  detailCache.delete(skillId);
}
