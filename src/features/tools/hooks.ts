import { useCallback, useEffect, useState } from "react";
import { listTools, setToolOverride, type ToolView } from "./api";
import { normalizeTauriError } from "../../lib/tauri";

/**
 * The tool registry as resolved on this machine, plus the two writes the
 * Settings page needs. Kept local to this feature rather than in the shared
 * installed-skills cache: tools change when the user edits Settings, not when
 * a skill is installed.
 */
export function useTools() {
  const [tools, setTools] = useState<ToolView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setError(undefined);
    try {
      setTools(await listTools());
    } catch (reason) {
      setError(normalizeTauriError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (
      toolId: string,
      readsShared: boolean | undefined,
      skillsDir: string | undefined,
    ) => {
      setSaving(toolId);
      setError(undefined);
      try {
        setTools(await setToolOverride(toolId, readsShared, skillsDir));
        return true;
      } catch (reason) {
        setError(normalizeTauriError(reason));
        return false;
      } finally {
        setSaving(undefined);
      }
    },
    [],
  );

  return { error, loading, refresh, save, saving, tools };
}
