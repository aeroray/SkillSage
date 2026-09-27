import { invokeCommand } from "../../lib/tauri";
import type {
  InstallResult,
  InstalledSkill,
  InstalledSkillsList,
  LocalSkillMatch,
  OpenPathResult,
  PathConflict,
  UpdateCheckList,
} from "./types";

export function installSkill(skillId: string, takeover?: boolean) {
  return invokeCommand<InstallResult>("install_skill", {
    skillId,
    conflictAction: takeover ? "takeover" : undefined,
  });
}

export function refreshInstalled() {
  return invokeCommand<InstalledSkillsList>("refresh_installed");
}

export function uninstallSkill(skillId: string) {
  return invokeCommand<void>("uninstall_skill", { skillId });
}

export function setToolDistribution(
  skillId: string,
  toolId: string,
  distributed: boolean,
) {
  return invokeCommand<InstalledSkill>("set_tool_distribution", {
    skillId,
    toolId,
    distributed,
  });
}

export function searchLocalSkillMatches(skillId: string, exhaustive = false) {
  return invokeCommand<LocalSkillMatch[]>("search_local_skill_matches", {
    exhaustive,
    skillId,
  });
}

export function linkLocalSkill(
  skillId: string,
  remoteSkillId: string,
  remoteVersion?: string,
) {
  return invokeCommand<InstalledSkill>("link_local_skill", {
    remoteSkillId,
    remoteVersion,
    skillId,
  });
}

export function checkUpdates(skillId?: string, skillIds?: string[]) {
  return invokeCommand<UpdateCheckList>("check_updates", { skillId, skillIds });
}

export function updateSkill(skillId: string) {
  return invokeCommand<InstalledSkill>("update_skill", { skillId });
}

export function checkInstallConflict(name: string) {
  return invokeCommand<PathConflict | undefined>("check_install_conflict", {
    name,
  });
}

export function openSkillDirectory(skillId: string) {
  return invokeCommand<void>("open_skill_directory", { skillId });
}

/** Opens any directory in the OS file manager. Despite the original name it was
 * never skills-root specific — it just forwards to the backend's `open_path`,
 * which is what the shared root button and the tool rows both need.
 *
 * A directory that does not exist yet is not an error: the backend opens the
 * nearest existing ancestor and reports which path it used, so the caller can
 * say so instead of leaving the click looking like it did nothing. */
export function openPath(path: string) {
  return invokeCommand<OpenPathResult>("open_path", { path });
}

/** Kept as an alias so existing call sites read naturally. */
export const openSkillsRoot = openPath;
