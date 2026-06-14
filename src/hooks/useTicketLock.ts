import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { getStationId } from "@/lib/station";
import {
  acquireTicketLock,
  refreshTicketLock,
  releaseTicketLock,
  takeOverTicketLock,
  getTicketLock,
  type TicketLock,
  type LockHolder,
} from "@/lib/repos/locks";

// One loop handles both heartbeat (when we hold the lock) and re-acquire polling
// (when we are read-only). Well under the 60s staleness window in locks.ts.
const LOCK_TICK_MS = 7_000;

export type LockStatus = "loading" | "held" | "readonly";

export interface TicketLockState {
  status: LockStatus;
  /** The current lock row (who holds it), when not held by us. */
  lock: TicketLock | null;
  /** Forcibly seize the lock from another machine. */
  takeOver: () => Promise<void>;
}

/**
 * Claim the edit lock for a ticket while this view is mounted, heartbeating to
 * keep it, and releasing it on unmount. If another machine holds it, we stay in
 * "readonly" and keep polling so editing re-enables the moment they finish.
 */
export function useTicketLock(ticketId: number): TicketLockState {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<LockStatus>("loading");
  const [lock, setLock] = useState<TicketLock | null>(null);
  const heldRef = useRef(false);

  const holder = useMemo<LockHolder>(
    () => ({ id: user?.id ?? null, name: user?.name ?? "Someone", station: getStationId() }),
    [user?.id, user?.name],
  );

  useEffect(() => {
    if (!Number.isFinite(ticketId)) return;
    let active = true;
    heldRef.current = false;

    async function tick() {
      try {
        if (heldRef.current) {
          const stillOurs = await refreshTicketLock(ticketId, holder);
          if (!stillOurs) {
            // Someone took the lock from under us; fall back to read-only.
            heldRef.current = false;
            const current = await getTicketLock(ticketId);
            if (active) {
              setLock(current);
              setStatus("readonly");
            }
          }
        } else {
          const { held, lock: current } = await acquireTicketLock(ticketId, holder);
          if (!active) return;
          heldRef.current = held;
          setLock(current);
          setStatus(held ? "held" : "readonly");
        }
      } catch {
        // Transient failure (e.g. the host PC is briefly unreachable). Leave the
        // current state in place; the next tick retries.
      }
    }

    void tick();
    const timer = setInterval(tick, LOCK_TICK_MS);
    return () => {
      active = false;
      clearInterval(timer);
      if (heldRef.current) void releaseTicketLock(ticketId, holder);
    };
  }, [ticketId, holder]);

  const takeOver = useCallback(async () => {
    await takeOverTicketLock(ticketId, holder);
    heldRef.current = true;
    setStatus("held");
    setLock(await getTicketLock(ticketId));
  }, [ticketId, holder]);

  return { status, lock, takeOver };
}
