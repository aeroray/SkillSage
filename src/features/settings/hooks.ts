import { useCallback, useEffect, useState } from "react";
import { normalizeTauriError } from "../../lib/tauri";
import { getSettings, setSettings } from "./api";
import type { SettingsUpdate } from "./types";

export function useSettings() {
  const [settings, setSettingsState] = useState<{ proxyUrl?: string; githubTokenConfigured: boolean }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setSettingsState(await getSettings());
    } catch (reason) {
      setError(normalizeTauriError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (update: SettingsUpdate) => {
    setSaving(true);
    setError(undefined);
    try {
      const next = await setSettings(update);
      setSettingsState(next);
      return next;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { error, loading, refresh, save, saving, settings };
}
