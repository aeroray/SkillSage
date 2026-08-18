import { invokeCommand } from "../../lib/tauri";
import type { SyncImportOptions, SyncImportPreview, SyncImportResult } from "./types";

export function exportPackage() {
  return invokeCommand<string>("export_package");
}

export function previewImportPackage(path: string) {
  return invokeCommand<SyncImportPreview>("preview_import_package", { path });
}

export function importPackage(path: string, options: SyncImportOptions) {
  return invokeCommand<SyncImportResult>("import_package", { path, options });
}
