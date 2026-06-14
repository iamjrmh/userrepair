/**
 * Live-sync state for multi-PC deployments.
 *
 * Two independent signals matter:
 *   - `online`:   is the data backend reachable? For a client this is the main
 *                 (host) PC on the LAN; for standalone/host it is always true
 *                 because the database is local.
 *   - `internet`: is the wider internet reachable? This only affects Square card
 *                 payments; the shop keeps running on the LAN without it.
 *
 * `rev` is a monotonic counter. Bumping it makes every `useAsync` loader re-run,
 * which is how connected PCs pick up each other's changes (and how a client
 * snaps back into sync the instant the host returns). All PCs share the host's
 * single database, so there is never a write to merge - only fresher reads.
 */
import { create } from "zustand";

interface SyncState {
  online: boolean;
  internet: boolean;
  rev: number;
  lastSyncAt: number | null;
  setOnline: (v: boolean) => void;
  setInternet: (v: boolean) => void;
  bumpRev: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  online: true,
  internet: typeof navigator !== "undefined" ? navigator.onLine : true,
  rev: 0,
  lastSyncAt: null,
  setOnline: (v) => set((s) => (s.online === v ? s : { online: v })),
  setInternet: (v) => set((s) => (s.internet === v ? s : { internet: v })),
  bumpRev: () => set((s) => ({ rev: s.rev + 1, lastSyncAt: Date.now() })),
}));

/** Manually broadcast "data changed" so other-view loaders refresh now. */
export function broadcastChange(): void {
  useSyncStore.getState().bumpRev();
}
