import { invokeCommand } from "../../lib/tauri";
import type { InstallResult, InstalledSkillsList } from "./types";

export function installTestSkill(agents: string[]) {
  return invokeCommand<InstallResult>("install_test_skill", { agents });
}

export function listInstalled() {
  return invokeCommand<InstalledSkillsList>("list_installed");
}

export function uninstallSkill(skillId: string) {
  return invokeCommand<void>("uninstall_skill", { skillId });
}
