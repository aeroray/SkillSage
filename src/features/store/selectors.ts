import type { SkillGroup, SkillSearchResult } from "./types";

export function groupByRepository(skills: SkillSearchResult[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const skill of skills) {
    const group = groups.get(skill.source);
    if (group) {
      group.additional.push(skill);
    } else {
      groups.set(skill.source, { source: skill.source, primary: skill, additional: [] });
    }
  }
  return [...groups.values()];
}
