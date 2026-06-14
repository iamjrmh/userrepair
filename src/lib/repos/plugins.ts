import { run, select } from "@/lib/db";
import type { PluginRecord } from "@/types";

export async function listPlugins(): Promise<PluginRecord[]> {
  return select<PluginRecord>(
    "SELECT * FROM plugin_registry WHERE deleted_at IS NULL ORDER BY name",
  );
}

export async function setPluginEnabled(id: number, enabled: boolean): Promise<void> {
  await run("UPDATE plugin_registry SET enabled = ?1 WHERE id = ?2", [enabled ? 1 : 0, id]);
}

/** Register a plugin from a parsed plugin.json manifest. */
export async function registerPlugin(manifest: {
  name: string;
  version: string;
  author?: string;
  entry?: string;
  permissions?: string[];
}): Promise<void> {
  await run(
    `INSERT INTO plugin_registry (plugin_id, name, version, author, entry_point, permissions, manifest, enabled)
     VALUES (?1,?2,?3,?4,?5,?6,?7,0)
     ON CONFLICT(plugin_id) DO UPDATE SET version = excluded.version, manifest = excluded.manifest`,
    [
      manifest.name,
      manifest.name,
      manifest.version,
      manifest.author ?? null,
      manifest.entry ?? null,
      JSON.stringify(manifest.permissions ?? []),
      JSON.stringify(manifest),
    ],
  );
}
