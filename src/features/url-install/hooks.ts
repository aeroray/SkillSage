import { useCallback, useState } from "react";
import { normalizeTauriError } from "../../lib/tauri";
import { inspectGithubUrl, installFromGithubUrl } from "./api";
import type { GithubUrlInspection, UrlInstallResult } from "./types";
import type { DistributionActions } from "../skills/types";

export function useGithubUrlInstall(onCompleted: () => void) {
  const [inspection, setInspection] = useState<GithubUrlInspection>();
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string>();

  const inspect = useCallback(async (url: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await inspectGithubUrl(url.trim());
      setInspection(result);
      return result;
    } catch (reason) {
      setInspection(undefined);
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  const install = useCallback(async (url: string, skillPath: string | undefined, agents: string[], conflicts?: DistributionActions): Promise<UrlInstallResult | undefined> => {
    setInstalling(true);
    setError(undefined);
    try {
      const result = await installFromGithubUrl(url.trim(), skillPath, agents, conflicts);
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
    setInspection(undefined);
    setError(undefined);
    setLoading(false);
    setInstalling(false);
  }, []);

  return { error, inspect, inspection, installing, loading, reset, install };
}
