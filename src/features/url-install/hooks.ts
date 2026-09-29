import { useCallback, useRef, useState } from "react";
import { normalizeTauriError } from "../../lib/tauri";
import { inspectGithubUrl, installFromGithubUrl } from "./api";
import type { GithubUrlInspection, UrlInstallResult } from "./types";

export function useGithubUrlInstall(onCompleted: () => void) {
  const [inspection, setInspection] = useState<GithubUrlInspection>();
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string>();
  // Guards against an earlier inspect resolving after a later one, which would
  // pair a stale selected path with the URL currently in the field.
  const inspectRequestId = useRef(0);

  const inspect = useCallback(async (url: string) => {
    const requestId = ++inspectRequestId.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await inspectGithubUrl(url.trim());
      if (requestId !== inspectRequestId.current) return undefined;
      setInspection(result);
      return result;
    } catch (reason) {
      if (requestId !== inspectRequestId.current) return undefined;
      setInspection(undefined);
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      if (requestId === inspectRequestId.current) setLoading(false);
    }
  }, []);

  const install = useCallback(async (url: string, skillPath: string | undefined, resolvedCommit: string | undefined, takeover?: boolean): Promise<UrlInstallResult | undefined> => {
    // Invalidate any in-flight inspection so a late response cannot repopulate
    // state after the install has already been committed.
    inspectRequestId.current += 1;
    setLoading(false);
    setInstalling(true);
    setError(undefined);
    try {
      // The commit comes from the inspection the user approved, so the install
      // is pinned to exactly the content that was previewed.
      const result = await installFromGithubUrl(url.trim(), skillPath, resolvedCommit, takeover);
      onCompleted();
      return result;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setInstalling(false);
    }
  }, [onCompleted]);

  const reset = useCallback(() => {
    // Drop the in-flight inspection's claim on the loading state without
    // cancelling the request itself. `installing` is deliberately left alone:
    // editing the URL field must not re-enable the button mid-install.
    inspectRequestId.current += 1;
    setInspection(undefined);
    setError(undefined);
    setLoading(false);
  }, []);

  return { error, inspect, inspection, installing, loading, reset, install };
}
