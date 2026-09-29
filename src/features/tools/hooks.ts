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
  // A set, not a single id: two tools' rows can be saved at once, and with one
  // slot the first save to finish cleared the other row's busy state.
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    // Without this the "重新检测" button stayed enabled and the skeleton never
    // returned after the first mount, so a slow or failing re-detect gave no
    // feedback at all.
    setLoading(true);
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
      setSavingIds((current) => new Set(current).add(toolId));
      setError(undefined);
      try {
        setTools(await setToolOverride(toolId, readsShared, skillsDir));
        return true;
      } catch (reason) {
        setError(normalizeTauriError(reason));
        return false;
      } finally {
        // Remove only this tool's entry, so a concurrent save on another row
        // keeps its own busy state.
        setSavingIds((current) => {
          const next = new Set(current);
          next.delete(toolId);
          return next;
        });
      }
    },
    [],
  );

  return { error, loading, refresh, save, savingIds, tools };
}
