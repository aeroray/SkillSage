import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { create } from "zustand";
import { getSettings } from "../settings/api";
import { invokeCommand, isBrowserPreview, normalizeTauriError } from "../../lib/tauri";

export type AppUpdatePhase = "idle" | "available" | "downloading" | "installing" | "error";

const LAST_CHECKED_AT_KEY = "skillsage.update.lastCheckedAt";

/** What the backend found, if anything. */
export type AppUpdateInfo = {
  version: string;
  notes?: string;
  date?: string;
  /** Which source answered: a mirror host, or `direct`. */
  source: string;
  elapsedMs: number;
};

/** Streamed from the backend while an update downloads. */
type AppUpdateProgress = {
  phase: string;
  downloaded: number;
  total?: number;
};

type AppUpdateState = {
  available: AppUpdateInfo | null;
  checking: boolean;
  error?: string;
  lastCheckedAt: string | null;
  phase: AppUpdatePhase;
  progress: number | null;
  /** The source that answered the last successful check, for display. */
  source: string | null;
  startupChecked: boolean;
  check: () => Promise<AppUpdateInfo | null>;
  checkOnStartup: () => Promise<void>;
  install: () => Promise<void>;
};

function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && !isBrowserPreview();
}

function readLastCheckedAt() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LAST_CHECKED_AT_KEY);
    return value && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

function persistLastCheckedAt(value: string) {
  try {
    window.localStorage.setItem(LAST_CHECKED_AT_KEY, value);
  } catch {
    // Local storage may be unavailable in restricted webviews; memory state still works.
  }
}

/**
 * The configured proxy, if any.
 *
 * The backend builds its own HTTP clients from `settings::load_runtime`, so it
 * needs the value passed explicitly here rather than reading it itself while
 * already inside an async command. Read at call time so a Settings change takes
 * effect on the next check.
 */
async function proxyOption(): Promise<string | undefined> {
  if (!isDesktopRuntime()) return undefined;
  try {
    const settings = await getSettings();
    const proxy = settings.proxyUrl?.trim();
    return proxy ? proxy : undefined;
  } catch {
    // A settings read failure must not block the update check.
    return undefined;
  }
}

function percentOf(progress: AppUpdateProgress): number | null {
  if (!progress.total || progress.total <= 0) return null;
  return Math.min(100, Math.round((progress.downloaded / progress.total) * 100));
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  available: null,
  checking: false,
  lastCheckedAt: readLastCheckedAt(),
  phase: "idle",
  progress: null,
  source: null,
  startupChecked: false,

  check: async () => {
    if (
      !isDesktopRuntime() ||
      get().checking ||
      get().phase === "downloading" ||
      get().phase === "installing"
    ) {
      return get().available;
    }

    set({ checking: true, error: undefined });
    try {
      // The backend races every mirror plus direct GitHub and reports which one
      // answered, so the network choice is not made here.
      const next = await invokeCommand<AppUpdateInfo | null>("check_app_update", {
        proxy: await proxyOption(),
      });
      const checkedAt = new Date().toISOString();
      persistLastCheckedAt(checkedAt);
      set({
        available: next,
        checking: false,
        error: undefined,
        lastCheckedAt: checkedAt,
        phase: next ? "available" : "idle",
        progress: null,
        source: next?.source ?? null,
      });
      return next;
    } catch (error) {
      const checkedAt = new Date().toISOString();
      persistLastCheckedAt(checkedAt);
      set({
        checking: false,
        error: normalizeTauriError(error),
        lastCheckedAt: checkedAt,
        phase: "error",
      });
      throw error;
    }
  },

  checkOnStartup: async () => {
    if (get().startupChecked || get().checking || !isDesktopRuntime()) {
      set({ startupChecked: true });
      return;
    }

    try {
      await get().check();
    } catch {
      // Startup checks stay quiet. The Settings page exposes the error on demand.
    } finally {
      set({ startupChecked: true });
    }
  },

  install: async () => {
    const update = get().available;
    if (!update || !isDesktopRuntime() || get().phase === "downloading" || get().phase === "installing") {
      return;
    }

    set({ error: undefined, phase: "downloading", progress: 0 });
    let unlisten: (() => void) | undefined;
    try {
      // The backend downloads and installs in one command, streaming progress
      // over an event; the binary's minisign signature is verified there.
      unlisten = await listen<AppUpdateProgress>("app-update-progress", (event) => {
        const payload = event.payload;
        set({
          phase: payload.phase === "installing" ? "installing" : "downloading",
          progress: percentOf(payload),
        });
      });
    } catch {
      // A missing event bridge must not block the install itself.
    }

    try {
      await invokeCommand<void>("install_app_update", { proxy: await proxyOption() });
      await relaunch();
    } catch (error) {
      set({ error: normalizeTauriError(error), phase: "error", progress: null });
    } finally {
      unlisten?.();
    }
  },
}));
