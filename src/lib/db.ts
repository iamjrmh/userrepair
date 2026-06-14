/**
 * Central database access layer (see RESEARCH.md section 3). All SQL lives in
 * this file and the per-domain repositories under `lib/repos/`. CRUD goes
 * through `tauri-plugin-sql`; atomic multi-table writes go through the native
 * `db_tx` command so they run on a single connection.
 */
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { SqlParam, TxStatement } from "@/types";

const DB_URL = "sqlite:userrepair.db";

let dbPromise: Promise<Database> | null = null;

/** Open (once) and configure the SQLite connection: WAL, FK, sane timeouts. */
async function openDatabase(): Promise<Database> {
  const db = await Database.load(DB_URL);
  await db.execute("PRAGMA journal_mode = WAL;");
  await db.execute("PRAGMA foreign_keys = ON;");
  await db.execute("PRAGMA synchronous = NORMAL;");
  await db.execute("PRAGMA busy_timeout = 5000;");
  return db;
}

/** Lazily-initialised singleton database handle. */
export function getDb(): Promise<Database> {
  if (!dbPromise) dbPromise = openDatabase();
  return dbPromise;
}

/** Run a SELECT and return all rows typed as `T`. */
export async function select<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

/** Run a SELECT and return the first row, or null. */
export async function getOne<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
  const rows = await select<T>(sql, params);
  return rows.length > 0 ? (rows[0] as T) : null;
}

export interface RunResult {
  rowsAffected: number;
  lastInsertId: number;
}

/** Run a single write statement. Returns rows affected and last insert id. */
export async function run(sql: string, params: SqlParam[] = []): Promise<RunResult> {
  const db = await getDb();
  const result = await db.execute(sql, params);
  return {
    rowsAffected: result.rowsAffected,
    lastInsertId: typeof result.lastInsertId === "number" ? result.lastInsertId : 0,
  };
}

interface TxResult {
  insert_ids: number[];
  rows_affected: number[];
}

/**
 * Run several statements atomically (all-or-nothing) on one connection.
 * Returns the `last_insert_rowid()` after each statement.
 */
export async function tx(statements: TxStatement[]): Promise<number[]> {
  const result = await invoke<TxResult>("db_tx", { statements });
  return result.insert_ids;
}

/** Soft-delete a row by stamping deleted_at. */
export async function softDelete(table: string, id: number): Promise<void> {
  await run(`UPDATE ${table} SET deleted_at = ?1 WHERE id = ?2`, [new Date().toISOString(), id]);
}

/** Count rows matching an optional WHERE clause (already filtered for soft delete). */
export async function count(sql: string, params: SqlParam[] = []): Promise<number> {
  const row = await getOne<{ n: number }>(sql, params);
  return row?.n ?? 0;
}
