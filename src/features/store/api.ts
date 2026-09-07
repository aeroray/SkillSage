import { invokeCommand } from "../../lib/tauri";
import type {
  LeaderboardRange,
  SkillDetail,
  SkillSearchResult,
  SkillTranslationCache,
} from "./types";

export function searchSkills(query: string) {
  return invokeCommand<SkillSearchResult[]>("search_skills", { query });
}

export function getLeaderboard(range: LeaderboardRange) {
  return invokeCommand<SkillSearchResult[]>("get_leaderboard", { range });
}

export function getSkillDetail(skillId: string) {
  return invokeCommand<SkillDetail>("get_skill_detail", { skillId });
}

export function translateSkillDescription(text: string) {
  return invokeCommand<string>("translate_skill_description", { text });
}

export function getSkillTranslations() {
  return invokeCommand<SkillTranslationCache>("get_skill_translations");
}

export function saveSkillTranslation(
  skillId: string,
  translatedDescription: string,
) {
  return invokeCommand<void>("save_skill_translation", {
    skillId,
    translatedDescription,
  });
}
