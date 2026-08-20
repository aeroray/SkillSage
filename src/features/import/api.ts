import { invokeCommand } from "../../lib/tauri";
import type { ImportPreview, ImportResult } from "./types";

export function previewLocalImport(path: string) {
  return invokeCommand<ImportPreview>("preview_local_import", { path });
}

export function importLocal(
  path: string,
  conflict: string,
  renameTo?: string,
  takeover?: boolean,
) {
  return invokeCommand<ImportResult>("import_local", {
    path,
    conflict,
    renameTo,
    conflictAction: takeover ? "takeover" : undefined,
  });
}
