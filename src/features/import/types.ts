export type ImportPreview = {
  sourcePath: string;
  /** Mirrors `core::import::source::ResolvedSource::kind`. Closed on purpose:
   * `| string` would collapse the union and defeat the `=== "file"` check. */
  sourceKind: "file" | "directory";
  skillRoot: string;
  name: string;
  description: string;
  fileCount: number;
  existingLocal: boolean;
  existingSkillId?: string;
  remoteConflict: boolean;
};

export type ImportResult = {
  id: string;
  name: string;
  owner: string;
  currentVersion: string;
  currentHash: string;
  installedPath: string;
};
