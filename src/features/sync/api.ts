import { invokeCommand } from "../../lib/tauri";
import type { SyncImportOptions, SyncImportPreview, SyncImportResult, SyncSettings } from "./types";

export function exportPackage(destination: string, settings: SyncSettings) {
  return invokeCommand<string>("export_package", { destination, syncSettings: settings });
}

export function previewImportPackage(path: string) {
  return invokeCommand<SyncImportPreview>("preview_import_package", { path });
}

export function importPackage(path: string, options: SyncImportOptions) {
  return invokeCommand<SyncImportResult>("import_package", { path, options });
}
