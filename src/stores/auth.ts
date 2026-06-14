import { create } from "zustand";
import type { AuthUser } from "@/types";
import { login as loginRepo } from "@/lib/repos/auth";

// sessionStorage so the user is signed out when userrepair is closed; a new
// user must sign in on reopen.
const STORAGE_KEY = "userrepair.session";

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  init: () => void;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  init: () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const user = raw ? (JSON.parse(raw) as AuthUser) : null;
      set({ user, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },
  login: async (username, password) => {
    const user = await loginRepo(username.trim(), password);
    if (!user) return false;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    set({ user });
    return true;
  },
  logout: () => {
    sessionStorage.removeItem(STORAGE_KEY);
    set({ user: null });
  },
}));
