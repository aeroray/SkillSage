import { useCallback, useState } from "react";
import { normalizeTauriError } from "../../lib/tauri";
import { cleanupApp, type CleanupMode, type CleanupResult } from "./api";

export function useAppCleanup() {
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<CleanupResult>();

  const run = useCallback(async (mode: CleanupMode) => {
    setCleaning(true);
    setError(undefined);
    setResult(undefined);
    try {
      const next = await cleanupApp(mode);
      setResult(next);
      return next;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setCleaning(false);
    }
  }, []);

  return { cleaning, error, result, run };
}
