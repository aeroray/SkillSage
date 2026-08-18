import { invokeCommand } from "../../lib/tauri";
import type { DistributionActions, DistributionConflict, InstallResult, InstalledSkillsList, UpdateCheckList, InstalledSkill } from "./types";

export function installTestSkill(agents: string[]) {
  return invokeCommand<InstallResult>("install_test_skill", { agents });
}

export function installSkill(skillId: string, agents: string[], conflicts?: DistributionActions) {
  return invokeCommand<InstallResult>("install_skill", { skillId, agents, conflicts });
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

export function checkUpdates(skillId?: string) {
  return invokeCommand<UpdateCheckList>("check_updates", { skillId });
}

export function updateSkill(skillId: string) {
  return invokeCommand<InstalledSkill>("update_skill", { skillId });
}

export function rollbackSkill(skillId: string, version: string) {
  return invokeCommand<InstalledSkill>("rollback_skill", { skillId, version });
}

export function adjustDistribution(skillId: string, agents: string[], conflicts?: DistributionActions) {
  return invokeCommand<InstalledSkill>("adjust_distribution", { skillId, agents, conflicts });
}

export function distributeSkills(skillIds: string[], agents: string[], conflicts?: DistributionActions) {
  return invokeCommand<InstalledSkillsList>("distribute_skills", { skillIds, agents, conflicts });
}

export function checkDistributionConflicts(skillName: string, agents: string[]) {
  return invokeCommand<DistributionConflict[]>("check_distribution_conflicts", { skillName, agents });
}
