import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { create } from "zustand";
import { isBrowserPreview, normalizeTauriError } from "../../lib/tauri";

export type AppUpdatePhase = "idle" | "available" | "downloading" | "installing" | "error";

const LAST_CHECKED_AT_KEY = "skillsage.update.lastCheckedAt";

type AppUpdateState = {
  available: Update | null;
  checking: boolean;
  error?: string;
  lastCheckedAt: string | null;
  phase: AppUpdatePhase;
  progress: number | null;
  startupChecked: boolean;
  check: () => Promise<Update | null>;
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

function closeUpdate(update: Update | null) {
  if (update) void update.close().catch(() => undefined);
}

function progressFromEvent(event: DownloadEvent, state: { downloaded: number; total: number | null }) {
  if (event.event === "Started") {
    state.downloaded = 0;
    state.total = event.data.contentLength ?? null;
    return 0;
  }
  if (event.event === "Progress") {
    state.downloaded += event.data.chunkLength;
    return state.total && state.total > 0 ? Math.min(100, Math.round((state.downloaded / state.total) * 100)) : null;
  }
  state.downloaded = state.total ?? state.downloaded;
  return 100;
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  available: null,
  checking: false,
  lastCheckedAt: readLastCheckedAt(),
  phase: "idle",
  progress: null,
  startupChecked: false,

  check: async () => {
    if (!isDesktopRuntime() || get().checking || get().phase === "downloading" || get().phase === "installing") {
      return get().available;
    }

    set({ checking: true, error: undefined });
    try {
      const next = await check({ timeout: 12_000 });
      const checkedAt = new Date().toISOString();
      const previous = get().available;
      if (previous !== next) closeUpdate(previous);
      persistLastCheckedAt(checkedAt);
      set({
        available: next,
        checking: false,
        error: undefined,
        lastCheckedAt: checkedAt,
        phase: next ? "available" : "idle",
        progress: null,
      });
      return next;
    } catch (error) {
      const checkedAt = new Date().toISOString();
      persistLastCheckedAt(checkedAt);
      set({ checking: false, error: normalizeTauriError(error), lastCheckedAt: checkedAt, phase: "error" });
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
    if (!update || !isDesktopRuntime() || get().phase === "downloading" || get().phase === "installing") return;

    set({ error: undefined, phase: "downloading", progress: 0 });
    const downloadState = { downloaded: 0, total: null as number | null };

    try {
      await update.downloadAndInstall((event) => {
        const progress = progressFromEvent(event, downloadState);
        set({ phase: event.event === "Finished" ? "installing" : "downloading", progress });
      });
      await relaunch();
    } catch (error) {
      set({ error: normalizeTauriError(error), phase: "error", progress: null });
    }
  },
}));
