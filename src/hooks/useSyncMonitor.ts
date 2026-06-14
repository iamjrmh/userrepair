import { useEffect } from "react";
import { useSyncStore } from "@/lib/sync";
import { getNetMode, getNetConfig, checkHost } from "@/lib/net";

// How often a client pings the host PC to confirm the LAN link is alive.
const HOST_PING_MS = 8_000;
// How often connected PCs refresh their views so they stay current with edits
// made on the other machines.
const REFRESH_MS = 15_000;

/**
 * Drive the live-sync state. Mount once, near the app root.
 *
 *  - Tracks internet availability (for the card-payment guard).
 *  - In client mode, pings the host and flips `online`; on reconnect it triggers
 *    an immediate resync so the client never shows stale data.
 *  - In any networked mode (host or client), bumps the refresh signal on an
 *    interval so every PC keeps up with the others.
 */
export function useSyncMonitor(): void {
  const setOnline = useSyncStore((s) => s.setOnline);
  const setInternet = useSyncStore((s) => s.setInternet);
  const bumpRev = useSyncStore((s) => s.bumpRev);

  useEffect(() => {
    const mode = getNetMode() ?? "standalone";

    // Internet status drives the Square card-payment guard only.
    const onOnline = () => setInternet(true);
    const onOffline = () => setInternet(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setInternet(navigator.onLine);

    let hostTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    if (mode === "client") {
      const cfg = getNetConfig();
      let wasOnline = true;
      const ping = async () => {
        let ok = false;
        try {
          ok = (await checkHost(cfg.host, cfg.key)).ok;
        } catch {
          ok = false;
        }
        setOnline(ok);
        // Coming back from an outage: pull everything fresh right away.
        if (ok && !wasOnline) bumpRev();
        wasOnline = ok;
      };
      void ping();
      hostTimer = setInterval(ping, HOST_PING_MS);
    } else {
      setOnline(true);
    }

    if (mode === "client" || mode === "host") {
      refreshTimer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        if (!useSyncStore.getState().online) return;
        bumpRev();
      }, REFRESH_MS);
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (hostTimer) clearInterval(hostTimer);
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [setOnline, setInternet, bumpRev]);
}
