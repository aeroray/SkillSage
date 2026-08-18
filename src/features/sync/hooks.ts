import { useCallback, useState } from "react";

import { exportPackage, importPackage, previewImportPackage } from "./api";
import type { SyncImportOptions, SyncImportPreview, SyncImportResult, SyncSettings } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

export function useSyncExport() {
  const [path, setPath] = useState<string>();
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState(false);

  const run = useCallback(async (destination: string, settings: SyncSettings) => {
    setExporting(true);
    setError(undefined);
    try {
      const result = await exportPackage(destination, settings);
      setPath(result);
      return result;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setExporting(false);
    }
  }, []);

  return { error, exporting, path, run };
}

export function useSyncImport() {
  const [preview, setPreview] = useState<SyncImportPreview>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const previewPath = useCallback(async (path: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await previewImportPackage(path.trim());
      setPreview(result);
      return result;
    } catch (reason) {
      setPreview(undefined);
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  const run = useCallback(async (path: string, options: SyncImportOptions): Promise<SyncImportResult | undefined> => {
    setImporting(true);
    setError(undefined);
    try {
      return await importPackage(path.trim(), options);
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setImporting(false);
    }
  }, []);

  return { error, importing, loading, preview, previewPath, run, setPreview };
}
