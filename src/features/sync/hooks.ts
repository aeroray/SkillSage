import { useCallback, useRef, useState } from "react";

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
  // Guards against an earlier preview resolving after a later one and
  // describing a different package than the one that would be imported.
  const previewRequestId = useRef(0);

  const previewPath = useCallback(async (path: string) => {
    const requestId = ++previewRequestId.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await previewImportPackage(path.trim());
      if (requestId !== previewRequestId.current) return undefined;
      setPreview(result);
      return result;
    } catch (reason) {
      if (requestId !== previewRequestId.current) return undefined;
      setPreview(undefined);
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      if (requestId === previewRequestId.current) setLoading(false);
    }
  }, []);

  const run = useCallback(async (path: string, options: SyncImportOptions): Promise<SyncImportResult | undefined> => {
    // Invalidate any in-flight preview so a late response cannot repopulate
    // state after the import has already been committed.
    previewRequestId.current += 1;
    setLoading(false);
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
