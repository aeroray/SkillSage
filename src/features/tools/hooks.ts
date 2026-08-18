import { useCallback, useEffect, useState } from "react";
import { detectTools } from "./api";
import type { DetectedTool } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

let cachedTools: DetectedTool[] | undefined;
let detectionPromise: Promise<DetectedTool[]> | undefined;

function loadTools(force = false) {
  if (!force && cachedTools) return Promise.resolve(cachedTools);
  if (detectionPromise) return detectionPromise;
  detectionPromise = detectTools()
    .then((result) => {
      cachedTools = result.tools;
      return result.tools;
    })
    .finally(() => {
      detectionPromise = undefined;
    });
  return detectionPromise;
}

export function useDetectedTools() {
  const [tools, setTools] = useState<DetectedTool[]>(() => cachedTools ?? []);
  const [loading, setLoading] = useState(() => !cachedTools);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async (force = true) => {
    setLoading(true);
    setError(undefined);
    try {
      setTools(await loadTools(force));
    } catch (reason) {
      setError(normalizeTauriError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return { error, loading, refresh, tools };
}
