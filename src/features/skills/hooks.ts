import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  checkInstallConflict,
  checkUpdates,
  installSkill,
  linkLocalSkill as linkLocalSkillApi,
  refreshInstalled,
  setClaudeDistribution,
  setWorkbuddyDistribution,
  uninstallSkill,
  updateSkill,
} from "./api";
import type {
  InstalledSkill,
  InstalledSkillsList,
  PathConflict,
  SkillProgress,
  UpdateInfo,
} from "./types";
import { normalizeTauriError } from "../../lib/tauri";

let cachedInstalledSkills: InstalledSkillsList | undefined;
let installedSkillsPromise: Promise<InstalledSkillsList> | undefined;
/** Bumped for every forced refresh, so a response from an older refresh can be
 * recognized as superseded and kept out of the cache. */
let installedSkillsGeneration = 0;

/** Stable snapshot for "nothing loaded yet". A fresh object here would make
 * `useSyncExternalStore` re-render forever. The empty root is falsy, which is
 * how every consumer already distinguishes "not loaded" from a real path. */
const EMPTY_INSTALLED: InstalledSkillsList = { skills: [], skillsRoot: "" };

const installedSubscribers = new Set<() => void>();

/**
 * Publishes a new cache value to every mounted consumer. The sidebar and the
 * skills page both read this cache, so a change made on one surface (install,
 * uninstall, distribution toggle) has to reach the other without a reload.
 */
function publishInstalledSkills(next: InstalledSkillsList | undefined) {
  cachedInstalledSkills = next;
  installedSubscribers.forEach((notify) => notify());
}

function subscribeInstalledSkills(notify: () => void) {
  installedSubscribers.add(notify);
  return () => installedSubscribers.delete(notify);
}

function getInstalledSkillsSnapshot() {
  return cachedInstalledSkills ?? EMPTY_INSTALLED;
}

function loadInstalledSkills(force = false) {
  if (!force) {
    if (cachedInstalledSkills) return Promise.resolve(cachedInstalledSkills);
    // Coalesce concurrent non-forced callers onto the request already running.
    if (installedSkillsPromise) return installedSkillsPromise;
  }
  const generation = ++installedSkillsGeneration;
  const request = refreshInstalled()
    .then((result) => {
      // A newer refresh may have started while this one was in flight; caching
      // then would overwrite fresher data with stale data.
      if (generation === installedSkillsGeneration) publishInstalledSkills(result);
      return result;
    })
    .finally(() => {
      if (installedSkillsPromise === request) installedSkillsPromise = undefined;
    });
  installedSkillsPromise = request;
  return request;
}

/** Refresh the shared installed-skill cache after another flow changes the
 * public skills directory, such as adopting an existing skill. */
export function refreshInstalledSkillsCache() {
  publishInstalledSkills(undefined);
  return loadInstalledSkills(true);
}

export function useInstalledSkills() {
  // `useSyncExternalStore` keeps every consumer on the same cache value, so
  // the sidebar counts cannot drift from the list after a mutation.
  const snapshot = useSyncExternalStore(
    subscribeInstalledSkills,
    getInstalledSkillsSnapshot,
  );
  const skills = snapshot.skills;
  const skillsRoot = snapshot.skillsRoot;
  const [loading, setLoading] = useState(() => !cachedInstalledSkills);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const refresh = useCallback(async (force = true) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(undefined);
    try {
      await loadInstalledSkills(force);
      // The cache publishes on success; only the request-scoped state is
      // settled here so a superseded request cannot clear a newer one.
    } catch (reason) {
      if (currentRequest === requestId.current)
        setError(normalizeTauriError(reason));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  const updateSkill = useCallback((updatedSkill: InstalledSkill) => {
    const current = cachedInstalledSkills;
    if (!current) return;
    publishInstalledSkills({
      ...current,
      skills: current.skills.map((skill) =>
        skill.id === updatedSkill.id ? updatedSkill : skill,
      ),
    });
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return {
    error,
    loading,
    refresh,
    skills,
    skillsRoot,
    updateSkill,
  };
}

export function useSkillInstall(onCompleted: () => void) {
  const [installing, setInstalling] = useState(false);
  const [stage, setStage] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();

  const install = useCallback(
    async (skillId: string, takeover?: boolean) => {
      setInstalling(true);
      setStage("downloading");
      setMessage("准备下载");
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
        const result = await installSkill(skillId, takeover);
        setStage("done");
        setMessage("安装完成");
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

  const clearError = useCallback(() => setError(undefined), []);

  return { clearError, error, install, installing, message, stage };
}

export function useSkillUpdates() {
  const [updates, setUpdates] = useState<UpdateInfo[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkingIds, setCheckingIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const check = useCallback(async (skillId?: string, skillIds?: string[]) => {
    const currentRequest = ++requestId.current;
    const requestedIds = skillIds ?? (skillId ? [skillId] : []);
    setChecking(true);
    setCheckingIds(requestedIds);
    setError(undefined);
    try {
      const result = await checkUpdates(skillId, skillIds);
      if (currentRequest === requestId.current) {
        setUpdates((current) => {
          const merged = new Map(current.map((item) => [item.id, item]));
          result.updates.forEach((item) => merged.set(item.id, item));
          return [...merged.values()];
        });
      }
      return result.updates;
    } catch (reason) {
      if (currentRequest === requestId.current)
        setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      if (currentRequest === requestId.current) {
        setChecking(false);
        setCheckingIds([]);
      }
    }
  }, []);

  return { check, checking, checkingIds, error, updates };
}

type SkillManagementAction =
  | "claude"
  | "workbuddy"
  | "match"
  | "uninstall"
  | "update";

type SkillManagementOptions = {
  refresh?: boolean;
};

export function useSkillManagement(onCompleted: () => void) {
  const [pending, setPending] = useState<string>();
  const [pendingAction, setPendingAction] = useState<{
    kind: SkillManagementAction;
    skillId: string;
  }>();
  const [error, setError] = useState<string>();

  const run = useCallback(
    async <T>(
      skillId: string,
      action: () => Promise<T>,
      kind: SkillManagementAction,
      options: SkillManagementOptions = {},
    ) => {
      setPending(skillId);
      setPendingAction({ kind, skillId });
      setError(undefined);
      try {
        const result = await action();
        if (options.refresh !== false) onCompleted();
        return result;
      } catch (reason) {
        setError(normalizeTauriError(reason));
        return undefined;
      } finally {
        setPending(undefined);
        setPendingAction(undefined);
      }
    },
    [onCompleted],
  );

  return {
    error,
    pending,
    pendingAction,
    uninstall: (skillId: string) =>
      run(
        skillId,
        async () => {
          await uninstallSkill(skillId);
          return true;
        },
        "uninstall",
      ),
    setClaudeDistribution: (
      skillId: string,
      distributed: boolean,
      options?: SkillManagementOptions,
    ) =>
      run(
        skillId,
        () => setClaudeDistribution(skillId, distributed),
        "claude",
        options,
      ),
    setWorkbuddyDistribution: (
      skillId: string,
      distributed: boolean,
      options?: SkillManagementOptions,
    ) =>
      run(
        skillId,
        () => setWorkbuddyDistribution(skillId, distributed),
        "workbuddy",
        options,
      ),
    linkLocalSkill: (
      skillId: string,
      remoteSkillId: string,
      remoteVersion?: string,
    ) =>
      run(
        skillId,
        () => linkLocalSkillApi(skillId, remoteSkillId, remoteVersion),
        "match",
      ),
    update: (skillId: string, options?: SkillManagementOptions) =>
      run(skillId, () => updateSkill(skillId), "update", options),
  };
}

export function useInstallConflictCheck() {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const check = useCallback(
    async (name: string): Promise<PathConflict | undefined> => {
      setChecking(true);
      setError(undefined);
      try {
        return await checkInstallConflict(name);
      } catch (reason) {
        setError(normalizeTauriError(reason));
        return undefined;
      } finally {
        setChecking(false);
      }
    },
    [],
  );
  return { check, checking, error };
}
