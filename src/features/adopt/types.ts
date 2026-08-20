/** A folder already sitting in the shared public directory that SkillSage
 * doesn't yet track. When the folder name differs from SKILL.md, the
 * declared name is authoritative after the user confirms the rename. */
export type AdoptableItem = {
  name: string;
  declaredName?: string;
  description: string;
  path: string;
  valid: boolean;
  removable: boolean;
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
