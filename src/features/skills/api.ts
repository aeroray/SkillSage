import { invokeCommand } from "../../lib/tauri";
import type {
  InstallResult,
  InstalledSkill,
  InstalledSkillsList,
  PathConflict,
  UpdateCheckList,
} from "./types";

export function installSkill(skillId: string, takeover?: boolean) {
  return invokeCommand<InstallResult>("install_skill", {
    skillId,
    conflictAction: takeover ? "takeover" : undefined,
  });
}

export function listInstalled() {
  return invokeCommand<InstalledSkillsList>("list_installed");
}

export function refreshInstalled() {
  return invokeCommand<InstalledSkillsList>("refresh_installed");
}

export function uninstallSkill(skillId: string) {
  return invokeCommand<void>("uninstall_skill", { skillId });
}

export function checkUpdates(skillId?: string, skillIds?: string[]) {
  return invokeCommand<UpdateCheckList>("check_updates", { skillId, skillIds });
}

export function updateSkill(skillId: string) {
  return invokeCommand<InstalledSkill>("update_skill", { skillId });
}

export function rollbackSkill(skillId: string, version: string) {
  return invokeCommand<InstalledSkill>("rollback_skill", { skillId, version });
}

export function checkInstallConflict(name: string) {
  return invokeCommand<PathConflict | undefined>("check_install_conflict", { name });
}

export function openSkillDirectory(skillId: string) {
  return invokeCommand<void>("open_skill_directory", { skillId });
}

export function openSkillsRoot(path: string) {
  return invokeCommand<void>("open_path", { path });
}
