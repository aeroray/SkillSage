import type { InstalledSkill, UpdateInfo } from "./types";

/**
 * Which channel a skill's content comes from. `builtin` is the offline
 * test fixture; it is kept distinct so it never gets offered as a normal
 * store skill.
 */
export type SkillSourceKind = "remote" | "local" | "builtin";

/**
 * What an update check can actually say about a skill. `no-source` exists
 * because a local or built-in skill has no remote to compare against: calling
 * it "up to date" would claim knowledge we do not have, so it gets its own
 * state instead of being folded into `current`.
 */
export type SkillStatusKind = "update" | "current" | "no-source";

export type SkillSourceFilter = "all" | SkillSourceKind;
export type SkillStatusFilter = "all" | SkillStatusKind;
/**
 * Only two orders, because the other two candidates were redundant rather
 * than useful: "by author" duplicated the always-on author grouping, and
 * "by update status" duplicated the status filter chips (which are the
 * better home for that question — filtering removes the noise instead of
 * just moving it). Direction is a separate axis so neither order needs an
 * inverse twin.
 */
export type SkillSortMode = "recent" | "name";
export type SkillSortDirection = "asc" | "desc";

/**
 * How a skill's distribution relates to the selected tools.
 *
 * `all` and `missing` are the two questions worth asking, and they are exact
 * complements: a skill is either in every selected tool or missing from at least
 * one, so their counts always sum to the total. An earlier version offered four
 * modes (any / all / none / some-but-not-all); the extra two were a distinction
 * without a decision, since "distributed to any" and "distributed to none" are
 * only meaningful once you have already decided that `all` and `missing` are not
 * what you meant.
 *
 * `any` applies no outcome filter. It is the same escape hatch the source and
 * status rows lead with, and it matters here because without it the very first
 * tool selection would drop straight into `all` — usually an empty list, which
 * reads as a broken filter rather than a truthful answer.
 */
export type SkillDistributionMatch = "any" | "all" | "missing";

/** No tool selected means the distribution axis is not filtering at all, which
 * is different from "distributed to none of the selected tools". */
export type SkillDistributionFilter = {
  toolIds: string[];
  match: SkillDistributionMatch;
};

export type SkillFilters = {
  search: string;
  source: SkillSourceFilter;
  status: SkillStatusFilter;
  sort: SkillSortMode;
  direction: SkillSortDirection;
  distribution: SkillDistributionFilter;
};

/** Hosts the backend treats as updateable remote sources. Mirrors
 * `core::lifecycle::remote::is_remote_record` so the UI never offers an
 * update check the backend would reject. */
const REMOTE_UPDATE_HOSTS = new Set([
  "skills.sh",
  "www.skills.sh",
  "github.com",
  "www.github.com",
  "raw.githubusercontent.com",
]);

export function isRemoteUpdateable(skill: InstalledSkill) {
  if (!skill.source.startsWith("https://")) return false;
  try {
    return REMOTE_UPDATE_HOSTS.has(new URL(skill.source).host);
  } catch {
    return false;
  }
}

export function sourceKindOf(skill: InstalledSkill): SkillSourceKind {
  if (skill.source.startsWith("local://")) return "local";
  if (skill.source.startsWith("builtin://")) return "builtin";
  return "remote";
}

export function statusKindOf(
  skill: InstalledSkill,
  updates: ReadonlyMap<string, UpdateInfo>,
): SkillStatusKind {
  if (!isRemoteUpdateable(skill)) return "no-source";
  return updates.get(skill.id)?.updateAvailable ? "update" : "current";
}

/**
 * Normalizes both timestamp shapes the lockfile can hold (unix seconds as a
 * numeric string, or an ISO date) to milliseconds. Mixing the two units
 * directly would order a whole class of skills incorrectly.
 */
function timestamp(value: string) {
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value.trim() !== "") {
    // Heuristic: values this small are seconds, not milliseconds.
    return numeric < 1e11 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sourceLabel(source: string) {
  if (source.startsWith("local://")) return "本地导入";
  if (source.startsWith("builtin://")) return "SkillSage 内置";
  if (source.includes("skills.sh")) return "skills.sh";
  return source.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/");
}

function matchesQuery(skill: InstalledSkill, query: string) {
  if (!query) return true;
  return [skill.name, skill.owner, skill.repo, skill.description, skill.source]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

/** Skills matching only the search box. Facet counts are computed from this
 * set so a chip's number answers "how many of my matches are in this group"
 * without the active facet filtering out its own alternatives. */
export function searchSkills(skills: InstalledSkill[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return skills;
  return skills.filter((skill) => matchesQuery(skill, query));
}

/**
 * Whether a skill satisfies a distribution filter.
 *
 * With no tools selected this is always true: an empty selection is "not
 * filtering", not "distributed to none of nothing", which would otherwise hide
 * every skill the moment the axis was touched and then cleared.
 */
export function matchesDistribution(
  skill: InstalledSkill,
  filter: SkillDistributionFilter,
) {
  const { toolIds } = filter;
  if (toolIds.length === 0 || filter.match === "any") return true;

  const distributedToAll = toolIds.every((toolId) =>
    skill.distributedTo.includes(toolId),
  );
  return filter.match === "all" ? distributedToAll : !distributedToAll;
}

/** How many skills each mode would leave, for the chip counts. Counted over
 * the search-only set so a chip's number does not collapse to the count of
 * whichever mode is active. */
export function countSkillsByDistribution(
  skills: InstalledSkill[],
  toolIds: string[],
): Record<SkillDistributionMatch, number> {
  const counts: Record<SkillDistributionMatch, number> = {
    any: 0,
    all: 0,
    missing: 0,
  };
  if (toolIds.length === 0) return counts;
  counts.any = skills.length;
  for (const skill of skills) {
    if (matchesDistribution(skill, { toolIds, match: "all" })) counts.all += 1;
    else counts.missing += 1;
  }
  return counts;
}

export function countSkillsBySource(skills: InstalledSkill[]) {
  const counts: Record<SkillSourceFilter, number> = {
    all: skills.length,
    remote: 0,
    local: 0,
    builtin: 0,
  };
  for (const skill of skills) counts[sourceKindOf(skill)] += 1;
  return counts;
}

export function countSkillsByStatus(
  skills: InstalledSkill[],
  updates: ReadonlyMap<string, UpdateInfo>,
) {
  const counts: Record<SkillStatusFilter, number> = {
    all: skills.length,
    update: 0,
    current: 0,
    "no-source": 0,
  };
  for (const skill of skills) counts[statusKindOf(skill, updates)] += 1;
  return counts;
}

export function filterAndSortSkills(
  skills: InstalledSkill[],
  updates: ReadonlyMap<string, UpdateInfo>,
  filters: SkillFilters,
) {
  const query = filters.search.trim().toLowerCase();
  // One signed comparison, flipped by the direction toggle. `asc` is A→Z for
  // name and oldest-first for date; `desc` is the reverse of each.
  const sign = filters.direction === "asc" ? 1 : -1;
  return skills
    .filter((skill) => {
      if (!matchesQuery(skill, query)) return false;
      if (filters.source !== "all" && sourceKindOf(skill) !== filters.source) {
        return false;
      }
      if (
        filters.status !== "all" &&
        statusKindOf(skill, updates) !== filters.status
      ) {
        return false;
      }
      if (!matchesDistribution(skill, filters.distribution)) return false;
      return true;
    })
    .sort((left, right) => {
      const primary =
        filters.sort === "name"
          ? sign * left.name.localeCompare(right.name, "zh-Hans-CN")
          : sign * (timestamp(left.installedAt) - timestamp(right.installedAt));
      // Author is the tiebreaker so the author-grouped layout stays coherent
      // when the primary key ties (identical names or timestamps).
      return (
        primary ||
        left.owner.localeCompare(right.owner) ||
        left.name.localeCompare(right.name, "zh-Hans-CN")
      );
    });
}

export function groupByAuthor(skills: InstalledSkill[]) {
  const grouped = new Map<string, InstalledSkill[]>();
  for (const skill of skills) {
    // Push into the existing bucket instead of spreading a fresh array per
    // skill, which made this O(n^2) in the number of skills per author.
    const bucket = grouped.get(skill.owner);
    if (bucket) bucket.push(skill);
    else grouped.set(skill.owner, [skill]);
  }
  return [...grouped.entries()];
}
