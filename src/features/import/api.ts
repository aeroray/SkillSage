import { invokeCommand } from "../../lib/tauri";
import type { ImportPreview, ImportResult } from "./types";

export function previewLocalImport(path: string) {
  return invokeCommand<ImportPreview>("preview_local_import", { path });
}

export function importLocal(path: string, agents: string[], conflict: string, renameTo?: string) {
  return invokeCommand<ImportResult>("import_local", { path, agents, conflict, renameTo });
}
