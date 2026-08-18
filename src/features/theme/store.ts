import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type ThemeAccent = "teal" | "blue" | "violet" | "orange";

type ThemeState = {
  accent: ThemeAccent;
  mode: ThemeMode;
  setAccent: (accent: ThemeAccent) => void;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      accent: "teal",
      mode: "system",
      setAccent: (accent) => set({ accent }),
      setMode: (mode) => set({ mode }),
    }),
    { name: "skillsage-theme" },
  ),
);
