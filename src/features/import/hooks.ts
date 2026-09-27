import { useCallback, useRef, useState } from "react";
import { normalizeTauriError } from "../../lib/tauri";
import { importLocal, previewLocalImport } from "./api";
import type { ImportPreview, ImportResult } from "./types";

export function useImport(onCompleted: () => void) {
  const [preview, setPreview] = useState<ImportPreview>();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();
  // Guards against an earlier preview resolving after a later one and
  // describing a different path than the one the dialog would import.
  const previewRequestId = useRef(0);

  const previewPath = useCallback(async (path: string) => {
    if (!path.trim()) return undefined;
    const requestId = ++previewRequestId.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await previewLocalImport(path.trim());
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

  const runImport = useCallback(async (path: string, conflict: string, renameTo?: string, takeover?: boolean): Promise<ImportResult | undefined> => {
    // Invalidate any in-flight preview so a late response cannot repopulate
    // state after the import has already been committed.
    previewRequestId.current += 1;
    setLoading(false);
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
    // Drop the in-flight preview's claim on the loading state without
    // cancelling the request itself. `importing` is deliberately left alone:
    // editing the path field must not re-enable the button mid-import.
    previewRequestId.current += 1;
    setPreview(undefined);
    setError(undefined);
    setLoading(false);
  }, []);

  return { error, importing, loading, preview, previewPath, reset, runImport };
}
