import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  adjustDistribution,
  checkUpdates,
  distributeSkills,
  installSkill,
  installTestSkill,
  refreshInstalled,
  rollbackSkill,
  uninstallSkill,
  updateSkill,
} from "./api";
import { checkDistributionConflicts } from "./api";
import type { DistributionActions, DistributionConflict, InstallResult, InstalledSkill, SkillProgress, UpdateInfo } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

export function useInstalledSkills() {
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await refreshInstalled();
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

export function useSkillInstall(onCompleted: () => void) {
  const [installing, setInstalling] = useState(false);
  const [stage, setStage] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();

  const install = useCallback(
    async (skillId: string, agents: string[], conflicts?: DistributionActions) => {
      setInstalling(true);
      setStage("downloading");
      setMessage("准备下载技能文件");
      setError(undefined);
      let unlisten: (() => void) | undefined;

      try {
        try {
          unlisten = await listen<SkillProgress>("skill-progress", (event) => {
            if (event.payload.skillId === skillId) {
              setStage(event.payload.stage);
              setMessage(event.payload.message);
            }
          });
        } catch {
          // Browser preview does not expose Tauri events.
        }
        const result = await installSkill(skillId, agents, conflicts);
        setStage("done");
        setMessage("已完成落库、校验和分发");
        onCompleted();
        return result;
      } catch (reason) {
        setStage("failed");
        setMessage("");
        setError(normalizeTauriError(reason));
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

export function useSkillUpdates() {
  const [updates, setUpdates] = useState<UpdateInfo[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();

  const check = useCallback(async (skillId?: string) => {
    setChecking(true);
    setError(undefined);
    try {
      const result = await checkUpdates(skillId);
      setUpdates(result.updates);
      return result.updates;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return [];
    } finally {
      setChecking(false);
    }
  }, []);

  return { check, checking, error, updates };
}

export function useSkillManagement(onCompleted: () => void) {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  const run = useCallback(
    async <T,>(skillId: string, action: () => Promise<T>) => {
      setPending(skillId);
      setError(undefined);
      try {
        const result = await action();
        onCompleted();
        return result;
      } catch (reason) {
        setError(normalizeTauriError(reason));
        return undefined;
      } finally {
        setPending(undefined);
      }
    },
    [onCompleted],
  );

  return {
    adjust: (skillId: string, agents: string[], conflicts?: DistributionActions) =>
      run(skillId, () => adjustDistribution(skillId, agents, conflicts)),
    distribute: (skillIds: string[], agents: string[], conflicts?: DistributionActions) =>
      run("batch", () => distributeSkills(skillIds, agents, conflicts)),
    error,
    pending,
    rollback: (skillId: string, version: string) =>
      run(skillId, () => rollbackSkill(skillId, version)),
    uninstall: (skillId: string) =>
      run(skillId, async () => {
        await uninstallSkill(skillId);
        return true;
      }),
    update: (skillId: string) => run(skillId, () => updateSkill(skillId)),
  };
}

export function useDistributionConflicts() {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const check = useCallback(async (skillName: string, agents: string[]): Promise<DistributionConflict[]> => {
    setChecking(true);
    setError(undefined);
    try {
      return await checkDistributionConflicts(skillName, agents);
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return [];
    } finally {
      setChecking(false);
    }
  }, []);
  return { check, checking, error };
}
