/** A folder already sitting in the shared public directory that SkillSage
 * doesn't yet track. The folder name (`name`) is authoritative for
 * adoption — it never moves files, so a SKILL.md's declared name (surfaced
 * only as `declaredName`/`warning` when it differs) is never used as the
 * record's name. */
export type AdoptableItem = {
  name: string;
  declaredName?: string;
  description: string;
  path: string;
  valid: boolean;
  recommended: boolean;
  warning?: string;
};

export type AdoptScanResult = {
  items: AdoptableItem[];
  scannedRoot: string;
};

export type AdoptSelection = {
  name: string;
};

export type AdoptFailure = {
  name: string;
  reason: string;
};

export type AdoptResult = {
  adopted: string[];
  skipped: string[];
  failed: AdoptFailure[];
};
