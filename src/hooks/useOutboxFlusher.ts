import { useEffect } from "react";
import { useSyncStore } from "@/lib/sync";
import { flushOutbox } from "@/lib/email";

// Periodic safety net in case navigator.onLine reports connected but the email
// actually failed (e.g. LAN up, WAN down). Light enough at the shop's volume.
const RETRY_MS = 90_000;

/**
 * Drive the email outbox: flush queued status emails on launch, whenever the
 * internet comes back, and on a slow timer. Mount once near the app root.
 */
export function useOutboxFlusher(): void {
  const internet = useSyncStore((s) => s.internet);

  // Runs on mount and whenever internet availability changes (incl. reconnect).
  useEffect(() => {
    void flushOutbox().catch(() => undefined);
  }, [internet]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (navigator.onLine) void flushOutbox().catch(() => undefined);
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, []);
}
