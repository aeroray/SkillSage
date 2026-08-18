import { invokeCommand } from "../../lib/tauri";
import type { MigrateResult, MigrateScanResult, MigrateSelection } from "./types";

export function scanMigrate() {
  return invokeCommand<MigrateScanResult>("scan_migrate");
}

export function executeMigrate(items: MigrateSelection[]) {
  return invokeCommand<MigrateResult>("execute_migrate", { items });
}

export function removeMigrateLink(sourcePath: string) {
  return invokeCommand<void>("remove_migrate_link", { sourcePath });
}

export function openMigratePath(path: string) {
  return invokeCommand<void>("open_path", { path });
}
