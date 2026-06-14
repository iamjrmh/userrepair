import { create } from "zustand";
import { getSetting, setSetting } from "@/lib/repos/settings";
import defaultLogo from "@/assets/logo.png";

/**
 * The top-left GUI logo. Defaults to the bundled userrepair mark; the owner can
 * replace it with their own (stored as a data URL in settings). This never
 * changes the application icon.
 */
interface BrandState {
  logo: string;
  /** The shop name shown in the sidebar; falls back to "userrepair" when unset. */
  name: string;
  init: () => Promise<void>;
  setLogo: (dataUrl: string) => Promise<void>;
  clearLogo: () => Promise<void>;
  setName: (name: string) => void;
}

export const useBrandStore = create<BrandState>((set) => ({
  logo: defaultLogo,
  name: "userrepair",
  init: async () => {
    const [stored, name] = await Promise.all([
      getSetting<string>("shop.logo_data", ""),
      getSetting<string>("shop.name", ""),
    ]);
    set({ logo: stored || defaultLogo, name: name.trim() || "userrepair" });
  },
  setName: (name) => set({ name: name.trim() || "userrepair" }),
  setLogo: async (dataUrl) => {
    await setSetting("shop.logo_data", dataUrl);
    set({ logo: dataUrl || defaultLogo });
  },
  clearLogo: async () => {
    await setSetting("shop.logo_data", "");
    set({ logo: defaultLogo });
  },
}));
