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
  init: () => Promise<void>;
  setLogo: (dataUrl: string) => Promise<void>;
  clearLogo: () => Promise<void>;
}

export const useBrandStore = create<BrandState>((set) => ({
  logo: defaultLogo,
  init: async () => {
    const stored = await getSetting<string>("shop.logo_data", "");
    set({ logo: stored || defaultLogo });
  },
  setLogo: async (dataUrl) => {
    await setSetting("shop.logo_data", dataUrl);
    set({ logo: dataUrl || defaultLogo });
  },
  clearLogo: async () => {
    await setSetting("shop.logo_data", "");
    set({ logo: defaultLogo });
  },
}));
