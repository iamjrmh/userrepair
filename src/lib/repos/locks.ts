/**
 * Ticket edit locks (see migration 0015). A lock is one row per ticket: the
 * machine that holds it is the active editor; every other machine sees the
 * ticket read-only until the lock is released or goes stale.
 *
 * All reads/writes go through the shared data layer, so in a multi-PC ("host"
 * / "client") deployment the locks live on the host and are visible to every
 * connected PC.
 */
import { run, getOne } from "@/lib/db";

export interface TicketLock {
  ticket_id: number;
  holder_id: number | null;
  holder_name: string;
  station: string;
  locked_at: string;
  heartbeat_at: string;
}

export interface LockHolder {
  id: number | null;
  name: string;
  station: string;
}

/** A lock whose heartbeat is older than this many ms is treated as abandoned. */
export const LOCK_STALE_MS = 60_000;

function staleCutoffIso(): string {
  return new Date(Date.now() - LOCK_STALE_MS).toISOString();
}

export async function getTicketLock(ticketId: number): Promise<TicketLock | null> {
  return getOne<TicketLock>("SELECT * FROM ticket_locks WHERE ticket_id = ?1", [ticketId]);
}

/**
 * Try to claim the edit lock. Succeeds (and refreshes the lock) when the ticket
 * is unlocked, already held by this same station, or the existing lock has gone
 * stale. Returns whether this station now holds it, plus the current lock row.
 */
export async function acquireTicketLock(
  ticketId: number,
  holder: LockHolder,
): Promise<{ held: boolean; lock: TicketLock | null }> {
  const now = new Date().toISOString();
  const res = await run(
    `INSERT INTO ticket_locks (ticket_id, holder_id, holder_name, station, locked_at, heartbeat_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(ticket_id) DO UPDATE SET
       holder_id = excluded.holder_id,
       holder_name = excluded.holder_name,
       station = excluded.station,
       locked_at = excluded.locked_at,
       heartbeat_at = excluded.heartbeat_at
     WHERE ticket_locks.station = excluded.station
        OR ticket_locks.heartbeat_at < ?7`,
    [ticketId, holder.id, holder.name, holder.station, now, now, staleCutoffIso()],
  );
  const lock = await getTicketLock(ticketId);
  const held = res.rowsAffected > 0 || lock?.station === holder.station;
  return { held, lock };
}

/** Keep our lock alive. Returns false if we no longer hold it (taken over). */
export async function refreshTicketLock(ticketId: number, holder: LockHolder): Promise<boolean> {
  const res = await run(
    "UPDATE ticket_locks SET heartbeat_at = ?1 WHERE ticket_id = ?2 AND station = ?3",
    [new Date().toISOString(), ticketId, holder.station],
  );
  return res.rowsAffected > 0;
}

/** Release our lock (no-op if another station now holds it). */
export async function releaseTicketLock(ticketId: number, holder: LockHolder): Promise<void> {
  await run("DELETE FROM ticket_locks WHERE ticket_id = ?1 AND station = ?2", [
    ticketId,
    holder.station,
  ]);
}

/** Forcibly seize the lock regardless of the current holder (manual override). */
export async function takeOverTicketLock(ticketId: number, holder: LockHolder): Promise<void> {
  const now = new Date().toISOString();
  await run(
    `INSERT INTO ticket_locks (ticket_id, holder_id, holder_name, station, locked_at, heartbeat_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(ticket_id) DO UPDATE SET
       holder_id = excluded.holder_id,
       holder_name = excluded.holder_name,
       station = excluded.station,
       locked_at = excluded.locked_at,
       heartbeat_at = excluded.heartbeat_at`,
    [ticketId, holder.id, holder.name, holder.station, now, now],
  );
}
