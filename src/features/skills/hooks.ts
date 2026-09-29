import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  checkInstallConflict,
  checkUpdates,
  installSkill,
  linkLocalSkill as linkLocalSkillApi,
  refreshInstalled,
  setToolDistribution,
  uninstallSkill,
  updateSkill,
} from "./api";
import type {
  InstalledSkill,
  InstalledSkillsList,
  PathConflict,
  SkillProgress,
  ToolOption,
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
const EMPTY_INSTALLED: InstalledSkillsList = {
  skills: [],
  skillsRoot: "",
  distributableTools: [],
  detectedTools: [],
};

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
    // Every tool that needs a link, for the Settings list which shows the whole
    // registry.
    tools: snapshot.distributableTools,
    detectedTools: snapshot.detectedTools,
    updateSkill,
  };
}

/**
 * The tools a skill should actually be offered for, which is narrower than the
 * full registry:
 *
 * - a tool that is not installed on this machine is noise in every row, so it
 *   is dropped;
 * - a tool that is already linked is kept even if it is no longer detected, so
 *   a link left behind by an uninstalled tool can still be removed.
 *
 * Without the detection filter the skills page would list all ~19 registered
 * tools against every skill.
 */
export function distributionTargetsFor(
  tools: ToolOption[],
  detectedTools: string[],
  skill: InstalledSkill,
): ToolOption[] {
  return tools.filter(
    (tool) => detectedTools.includes(tool.id) || skill.distributedTo.includes(tool.id),
  );
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
  // Read synchronously by `check`, unlike the `checking` state, which a
  // back-to-back call would still see as false before React re-renders.
  const checkingRef = useRef(false);

  const check = useCallback(async (skillId?: string, skillIds?: string[]) => {
    // One check at a time. Without this, a single-row check started while a
    // whole-library check was running replaced `checkingIds` (collapsing every
    // row's 检查中 overlay to one row), and the superseded check's results were
    // dropped by the guard below while still being returned to the caller —
    // so the user was told "发现可用更新" for a row that showed no update.
    if (checkingRef.current) return undefined;
    const currentRequest = ++requestId.current;
    const requestedIds = skillIds ?? (skillId ? [skillId] : []);
    checkingRef.current = true;
    setChecking(true);
    setCheckingIds(requestedIds);
    setError(undefined);
    try {
      const result = await checkUpdates(skillId, skillIds);
      if (currentRequest !== requestId.current) return undefined;
      setUpdates((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        result.updates.forEach((item) => merged.set(item.id, item));
        return [...merged.values()];
      });
      return result.updates;
    } catch (reason) {
      if (currentRequest === requestId.current)
        setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      if (currentRequest === requestId.current) {
        checkingRef.current = false;
        setChecking(false);
        setCheckingIds([]);
      }
    }
  }, []);

  return { check, checking, checkingIds, error, updates };
}

type SkillManagementAction =
  | "distribution"
  | "match"
  | "uninstall"
  | "update";

type SkillManagementOptions = {
  refresh?: boolean;
};

export function useSkillManagement(onCompleted: () => void) {
  // A map, not a single slot. `pending` used to be one skill id, but the row's
  // busy state is derived per row — so with a single slot, starting an action on
  // row B left row A's controls enabled, and whichever finished first cleared
  // the *other* row's busy state while it was still running. The backend
  // serializes on its write lock, so nothing was corrupted; the UI simply lied
  // and invited a third action on a row that already had one in flight.
  const [pendingActions, setPendingActions] = useState<
    Map<string, SkillManagementAction>
  >(() => new Map());
  const [error, setError] = useState<string>();

  const run = useCallback(
    async <T>(
      skillId: string,
      action: () => Promise<T>,
      kind: SkillManagementAction,
      options: SkillManagementOptions = {},
    ) => {
      setPendingActions((current) =>
        new Map(current).set(skillId, kind),
      );
      setError(undefined);
      try {
        const result = await action();
        if (options.refresh !== false) onCompleted();
        return result;
      } catch (reason) {
        setError(normalizeTauriError(reason));
        return undefined;
      } finally {
        // Remove only this skill's entry, so a concurrent action on another row
        // keeps its own busy state.
        setPendingActions((current) => {
          const next = new Map(current);
          next.delete(skillId);
          return next;
        });
      }
    },
    [onCompleted],
  );

  return {
    error,
    pendingActions,
    uninstall: (skillId: string) =>
      run(
        skillId,
        async () => {
          await uninstallSkill(skillId);
          return true;
        },
        "uninstall",
      ),
    setToolDistribution: (
      skillId: string,
      toolId: string,
      distributed: boolean,
      options?: SkillManagementOptions,
    ) =>
      run(
        skillId,
        () => setToolDistribution(skillId, toolId, distributed),
        "distribution",
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
  /** Clears a failure so it cannot surface in a dialog that was reopened for a
   * different skill. The dialogs stay mounted while closed, so without this the
   * previous error banner was still rendered next to an empty path field. */
  const clearError = useCallback(() => setError(undefined), []);
  return { check, checking, clearError, error };
}
