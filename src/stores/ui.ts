import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  collapsedGroups: string[];
  toggleGroup: (name: string) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

const SIDEBAR_KEY = "userrepair.sidebar-collapsed";
const GROUPS_KEY = "userrepair.collapsed-groups";

function loadGroups(): string[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === "1",
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    set({ sidebarCollapsed: next });
  },
  collapsedGroups: loadGroups(),
  toggleGroup: (name) => {
    const current = get().collapsedGroups;
    const next = current.includes(name) ? current.filter((g) => g !== name) : [...current, name];
    localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
    set({ collapsedGroups: next });
  },
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
