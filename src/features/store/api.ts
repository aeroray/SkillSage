import { invokeCommand } from "../../lib/tauri";
import type { LeaderboardRange, SkillDetail, SkillSearchResult } from "./types";

export function searchSkills(query: string) {
  return invokeCommand<SkillSearchResult[]>("search_skills", { query });
}

export function getLeaderboard(range: LeaderboardRange) {
  return invokeCommand<SkillSearchResult[]>("get_leaderboard", { range });
}

export function getSkillDetail(skillId: string) {
  return invokeCommand<SkillDetail>("get_skill_detail", { skillId });
}
