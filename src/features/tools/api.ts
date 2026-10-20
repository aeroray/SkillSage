import { invokeCommand } from "../../lib/tauri";

/** One AI tool the app knows how to reach, as resolved on this machine. */
export type ToolView = {
  id: string;
  label: string;
  /** Resolved skills directory, or null for a tool with no directory of its own. */
  skillsDir: string | null;
  /** What the built-in registry says, so the UI can show what resetting restores. */
  readsSharedDefault: boolean;
  /** The effective value after the user's override. */
  readsShared: boolean;
  customized: boolean;
  detected: boolean;
  /** Whether a per-skill link is needed at all. */
  distributable: boolean;
  /** Where the entry came from, so a wrong path can be checked. */
  source: string;
  /** True when `source` is the vendor's own documentation. */
  verified: boolean;
};

export function listTools() {
  return invokeCommand<ToolView[]>("list_tools");
}

/**
 * Patches one tool's override and returns the refreshed list.
 *
 * The arguments are a patch, not a replacement: an omitted field keeps its
 * stored value, so a write that only touches one field cannot delete the other.
 * The reads-shared toggle therefore sends only `readsShared` and no path, which
 * is what stops it from wiping a customized directory. `skillsDir` sets the
 * path; removing it needs `clearSkillsDir`, since an absent path means "leave
 * it alone". Also, a `readsShared` equal to the registry default is normalized
 * away by the backend, which is how that field is restored.
 */
export function setToolOverride(
  toolId: string,
  readsShared: boolean | undefined,
  skillsDir: string | undefined,
  options: { clearSkillsDir?: boolean } = {},
) {
  return invokeCommand<ToolView[]>("set_tool_override", {
    toolId,
    readsShared,
    skillsDir,
    clearSkillsDir: options.clearSkillsDir,
  });
}
