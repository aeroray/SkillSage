import { useCallback, useEffect, useState } from "react";
import { detectTools } from "./api";
import type { DetectedTool } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

export function useDetectedTools() {
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await detectTools();
      setTools(result.tools);
    } catch (reason) {
      setError(normalizeTauriError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { error, loading, refresh, tools };
}
