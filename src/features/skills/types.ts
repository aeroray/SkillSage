import type { SkillSearchResult } from "../store/types";

export type InstalledSkill = {
  id: string;
  name: string;
  owner: string;
  repo: string;
  skillPath?: string;
  source: string;
  description: string;
  currentVersion: string;
  currentHash: string;
  installedAt: string;
  /** Tool ids this skill is linked into. Comes from the backend registry, so
   * the UI never hardcodes a tool name. */
  distributedTo: string[];
};

/** One tool a skill can be distributed into. Supplied by the backend so a newly
 * registered tool appears without a frontend change. */
export type ToolOption = {
  id: string;
  label: string;
};

/** Mirrors the closed set the backend produces in
 * `core::lifecycle::match_local::verification_for_error` and its callers. The
 * union is intentionally closed: `| string` would collapse it to `string` and
 * silently discard every literal, removing the narrowing the label/help
 * branches rely on. Both of those branches already have a default case. */
export type LocalSkillMatch = SkillSearchResult & {
  verification:
    | "exact"
    | "different"
    | "rate-limited"
    | "auth-required"
    | "not-found"
    | "path-not-found"
    | "network-error"
    | "too-large"
    | "unavailable";
  remoteVersion?: string;
  remoteHash?: string;
  descriptionMatch: boolean;
  matchBasis: "npx-lock" | "store-search";
};

export type InstalledSkillsList = {
  skillsRoot: string;
  skills: InstalledSkill[];
  distributableTools: ToolOption[];
  /** Ids of tools detected on this machine. */
  detectedTools: string[];
};

export type InstallResult = {
  id: string;
  name: string;
  owner: string;
  currentVersion: string;
  currentHash: string;
  installPath: string;
};

export type SkillProgress = {
  skillId: string;
  stage: string;
  message: string;
};

export type UpdateInfo = {
  id: string;
  currentVersion: string;
  currentHash: string;
  latestVersion: string;
  latestHash: string;
  updateAvailable: boolean;
};

export type UpdateCheckList = {
  updates: UpdateInfo[];
};

/** An untracked foreign path already occupying the flat slot a skill name
 * would install into. Skip/cancel are handled entirely client-side (the
 * caller just doesn't retry the install); only takeover reaches the
 * backend. */
export type PathConflict = {
  name: string;
  path: string;
  kind: "directory" | "link";
};
