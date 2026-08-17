import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { installTestSkill, listInstalled, uninstallSkill } from "./api";
import type { InstallResult, InstalledSkill, SkillProgress } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

export function useInstalledSkills() {
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await listInstalled();
      setSkills(result.skills);
    } catch (reason) {
      setError(normalizeTauriError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { error, loading, refresh, setSkills, skills };
}

export function usePhase2Install(onCompleted: () => void) {
  const [installing, setInstalling] = useState(false);
  const [stage, setStage] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();

  const install = useCallback(
    async (agents: string[]): Promise<InstallResult | undefined> => {
      setInstalling(true);
      setStage("downloading");
      setMessage("准备安装测试技能…");
      setError(undefined);
      let unlisten: (() => void) | undefined;

      try {
        try {
          unlisten = await listen<SkillProgress>("skill-progress", (event) => {
            setStage(event.payload.stage);
            setMessage(event.payload.message);
          });
        } catch {
          // Browser preview does not expose Tauri events; invoke will report the real error.
        }
        const result = await installTestSkill(agents);
        setStage("done");
        setMessage("已完成落库、哈希和分发");
        onCompleted();
        return result;
      } catch (reason) {
        setStage("failed");
        setMessage("");
        setError(normalizeTauriError(reason));
        return undefined;
      } finally {
        unlisten?.();
        setInstalling(false);
      }
    },
    [onCompleted],
  );

  return { error, install, installing, message, stage };
}

export function useUninstallSkill(onCompleted: () => void) {
  const [uninstalling, setUninstalling] = useState(false);
  const [error, setError] = useState<string>();

  const uninstall = useCallback(
    async (skillId: string) => {
      setUninstalling(true);
      setError(undefined);
      try {
        await uninstallSkill(skillId);
        onCompleted();
      } catch (reason) {
        setError(normalizeTauriError(reason));
      } finally {
        setUninstalling(false);
      }
    },
    [onCompleted],
  );

  return { error, uninstall, uninstalling };
}
