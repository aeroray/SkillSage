import type { InstalledSkill, UpdateInfo } from "./types";

export type SkillSourceFilter = "all" | "skills.sh" | "builtin" | "local";
export type SkillStatusFilter = "all" | "update" | "current";
export type SkillSortMode = "recent" | "name" | "source";

function timestamp(value: string) {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? Date.parse(value) : numeric;
}

export function sourceLabel(source: string) {
  if (source.startsWith("local://")) return "本地导入";
  if (source.startsWith("builtin://")) return "内置来源";
  if (source.includes("skills.sh")) return "skills.sh";
  return source.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/");
}

export function filterAndSortSkills(
  skills: InstalledSkill[],
  updates: ReadonlyMap<string, UpdateInfo>,
  filters: {
    search: string;
    source: SkillSourceFilter;
    status: SkillStatusFilter;
    sort: SkillSortMode;
  },
) {
  const query = filters.search.trim().toLowerCase();
  return [...skills]
    .filter((skill) => {
      const updateAvailable = updates.get(skill.id)?.updateAvailable ?? false;
      const matchesQuery = !query || [skill.name, skill.owner, skill.description, skill.source].join(" ").toLowerCase().includes(query);
      const matchesSource = filters.source === "all"
        || (filters.source === "builtin" && skill.source.startsWith("builtin://"))
        || (filters.source === "local" && skill.source.startsWith("local://"))
        || (filters.source === "skills.sh" && !skill.source.startsWith("builtin://") && !skill.source.startsWith("local://"));
      const matchesStatus = filters.status === "all"
        || (filters.status === "update" && updateAvailable)
        || (filters.status === "current" && !updateAvailable);
      return matchesQuery && matchesSource && matchesStatus;
    })
    .sort((left, right) => {
      if (filters.sort === "name") return left.name.localeCompare(right.name);
      if (filters.sort === "source") return sourceLabel(left.source).localeCompare(sourceLabel(right.source));
      return timestamp(right.installedAt) - timestamp(left.installedAt);
    });
}

export function groupByAuthor(skills: InstalledSkill[]) {
  const grouped = new Map<string, InstalledSkill[]>();
  for (const skill of skills) grouped.set(skill.owner, [...(grouped.get(skill.owner) ?? []), skill]);
  return [...grouped.entries()];
}
