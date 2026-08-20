import { invokeCommand } from "../../lib/tauri";
import type { AdoptResult, AdoptScanResult, AdoptSelection } from "./types";

// The backend keeps its original Rust module/command names (`scan_migrate`/
// `execute_migrate`) for minimal churn — only the shapes changed to the
// single-shared-directory "adopt" model. The frontend is free to present
// this as "Adopt" without the command names matching.
export function scanAdoptCandidates() {
  return invokeCommand<AdoptScanResult>("scan_migrate");
}

export function adoptSkills(items: AdoptSelection[]) {
  return invokeCommand<AdoptResult>("execute_migrate", { items });
}

export function openAdoptPath(path: string) {
  return invokeCommand<void>("open_path", { path });
}
