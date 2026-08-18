import { invokeCommand } from "../../lib/tauri";

export type CleanupMode = "all" | "keep-skills";

export type CleanupResult = {
  mode: CleanupMode;
  removedLinks: number;
  centralRemoved: boolean;
  managementDataRemoved: boolean;
};

export function cleanupApp(mode: CleanupMode) {
  return invokeCommand<CleanupResult>("cleanup_app", { mode });
}
