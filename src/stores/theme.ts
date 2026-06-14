import { create } from "zustand";
import type { ThemeMode } from "@/types";

const STORAGE_KEY = "userrepair.theme";

type Resolved = "dark" | "light";

interface ThemeState {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (mode: ThemeMode) => void;
  init: () => void;
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(mode: ThemeMode): Resolved {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function apply(resolved: Resolved): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "dark",
  resolved: "dark",
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    const resolved = resolve(mode);
    apply(resolved);
    set({ mode, resolved });
  },
  init: () => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "dark";
    const resolved = resolve(stored);
    apply(resolved);
    set({ mode: stored, resolved });
    // React to OS theme changes when in system mode.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (get().mode === "system") {
        const next = resolve("system");
        apply(next);
        set({ resolved: next });
      }
    });
  },
}));
