import { getOne, run, select } from "@/lib/db";

/** All settings as a key -> JSON-decoded value map. */
export async function loadSettings(): Promise<Record<string, unknown>> {
  const rows = await select<{ key: string; value: string }>(
    "SELECT key, value FROM app_settings WHERE deleted_at IS NULL",
  );
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

/** Read one setting, decoded, with a typed fallback. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await getOne<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?1 AND deleted_at IS NULL",
    [key],
  );
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

/** Upsert one setting (value is JSON-encoded). */
export async function setSetting(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await run(
    `INSERT INTO app_settings (key, value) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, json],
  );
}
