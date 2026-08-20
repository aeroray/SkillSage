import { useCallback, useState } from "react";
import { normalizeTauriError } from "../../lib/tauri";
import { importLocal, previewLocalImport } from "./api";
import type { ImportPreview, ImportResult } from "./types";

export function useImport(onCompleted: () => void) {
  const [preview, setPreview] = useState<ImportPreview>();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();

  const previewPath = useCallback(async (path: string) => {
    if (!path.trim()) return undefined;
    setLoading(true);
    setError(undefined);
    try {
      const result = await previewLocalImport(path.trim());
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

  const runImport = useCallback(async (path: string, conflict: string, renameTo?: string, takeover?: boolean): Promise<ImportResult | undefined> => {
    setImporting(true);
    setError(undefined);
    try {
      const result = await importLocal(path.trim(), conflict, renameTo?.trim() || undefined, takeover);
      onCompleted();
      return result;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setImporting(false);
    }
  }, [onCompleted]);

  const reset = useCallback(() => {
    setPreview(undefined);
    setError(undefined);
    setLoading(false);
    setImporting(false);
  }, []);

  return { error, importing, loading, preview, previewPath, reset, runImport };
}
