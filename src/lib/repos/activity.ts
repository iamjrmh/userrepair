import { run, select } from "@/lib/db";
import type { ActivityEntry } from "@/types";

/** Append an entry to the global activity log (used across all modules). */
export async function logActivity(
  entityType: string,
  entityId: number | null,
  action: string,
  summary: string,
  technicianId: number | null = null,
): Promise<void> {
  await run(
    `INSERT INTO activity_log (entity_type, entity_id, action, summary, technician_id)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
    [entityType, entityId, action, summary, technicianId],
  );
}

/** Most recent activity entries for the dashboard feed. */
export async function recentActivity(limit = 20): Promise<ActivityEntry[]> {
  return select<ActivityEntry>(
    "SELECT * FROM activity_log WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?1",
    [limit],
  );
}
