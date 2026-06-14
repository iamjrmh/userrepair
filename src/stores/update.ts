import { create } from "zustand";
import { checkForUpdate, installUpdate, type UpdateInfo } from "@/lib/update";

// Tauri command rejections come back as plain strings (the Err(String)), not
// Error instances, so pull the message out of either shape.
function errorMessage(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return fallback;
}

/**
 * Update state shared by the top-bar button (shows a dot when an update is
 * available) and the update dialog. The check runs when the app opens and when
 * the owner opens the dialog - never on a background timer, so it cannot
 * interrupt a sale or a ticket edit.
 */
interface UpdateState {
  checking: boolean;
  installing: boolean;
  info: UpdateInfo | null;
  error: string | null;
  dialogOpen: boolean;
  /** Check for an update; pass surface=true to auto-open the dialog if one is found. */
  check: (surface?: boolean) => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;
  install: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  checking: false,
  installing: false,
  info: null,
  error: null,
  dialogOpen: false,

  check: async (surface) => {
    if (get().checking) return;
    set({ checking: true, error: null });
    try {
      const info = await checkForUpdate();
      set((s) => ({
        info,
        checking: false,
        // On launch, pop the dialog open the moment an update is found.
        dialogOpen: surface && info.available ? true : s.dialogOpen,
      }));
    } catch (e) {
      // Stay silent on the badge; the error only surfaces inside the dialog.
      set({ checking: false, error: errorMessage(e, "Update check failed") });
    }
  },

  openDialog: () => {
    set({ dialogOpen: true });
    void get().check();
  },

  closeDialog: () => set({ dialogOpen: false }),

  install: async () => {
    const info = get().info;
    if (!info?.asset_url || !info?.asset_name) return;
    set({ installing: true, error: null });
    try {
      // On success the backend exits the app to let the installer run; control
      // does not return here.
      await installUpdate(info.asset_url, info.asset_name);
    } catch (e) {
      set({ installing: false, error: errorMessage(e, "Install failed") });
    }
  },
}));
