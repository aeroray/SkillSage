import type { LeaderboardRange, SkillSearchResult } from "./types";

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
