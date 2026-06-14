import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { run, select } from "@/lib/db";
import type { BackupCreateResult, BackupRecord } from "@/types";

/** Run a manual backup: prompt for a destination, archive, and log it. */
export async function runBackup(): Promise<BackupCreateResult | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = await save({
    title: "Save userrepair backup",
    defaultPath: `userrepair-backup-${stamp}.zip`,
    filters: [{ name: "Zip archive", extensions: ["zip"] }],
  });
  if (!dest) return null;

  const result = await invoke<BackupCreateResult>("backup_create", { destZip: dest });
  await run(
    "INSERT INTO backup_log (path, size_bytes, file_count, kind) VALUES (?1, ?2, ?3, 'manual')",
    [result.path, result.size, result.file_count],
  );
  return result;
}

/** Restore from a chosen backup ZIP. Returns the number of files restored. */
export async function restoreBackup(): Promise<number | null> {
  const src = await open({
    title: "Restore userrepair backup",
    multiple: false,
    directory: false,
    filters: [{ name: "Zip archive", extensions: ["zip"] }],
  });
  if (!src || Array.isArray(src)) return null;
  return invoke<number>("backup_restore", { srcZip: src });
}

export async function backupHistory(limit = 10): Promise<BackupRecord[]> {
  return select<BackupRecord>(
    "SELECT * FROM backup_log WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?1",
    [limit],
  );
}
