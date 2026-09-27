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
 * Saves one tool's override and returns the refreshed list.
 *
 * `undefined` clears a field back to the registry default rather than storing
 * the current value as an explicit override, so a later registry fix reaches a
 * user who never meant to pin anything.
 */
export function setToolOverride(
  toolId: string,
  readsShared: boolean | undefined,
  skillsDir: string | undefined,
) {
  return invokeCommand<ToolView[]>("set_tool_override", {
    toolId,
    readsShared,
    skillsDir,
  });
}
