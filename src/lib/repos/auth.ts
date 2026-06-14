import { invoke } from "@tauri-apps/api/core";
import { getOne, run, select, softDelete } from "@/lib/db";
import { logActivity } from "@/lib/repos/activity";
import type { AuthUser, Technician, TechRole } from "@/types";

async function hash(password: string): Promise<string> {
  return invoke<string>("hash_password", { password });
}

async function verify(password: string, hashValue: string): Promise<boolean> {
  return invoke<boolean>("verify_password", { password, hash: hashValue });
}

async function getByUsername(username: string): Promise<Technician | null> {
  return getOne<Technician>(
    "SELECT * FROM technicians WHERE username = ?1 AND deleted_at IS NULL",
    [username],
  );
}

/** True when no login account exists yet (a fresh install needing setup). */
export async function needsSetup(): Promise<boolean> {
  const row = await getOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM technicians WHERE username IS NOT NULL AND deleted_at IS NULL AND active = 1",
  );
  return (row?.n ?? 0) === 0;
}

/** Authenticate a username/password. Returns the user, or null on failure. */
export async function login(username: string, password: string): Promise<AuthUser | null> {
  const account = await getByUsername(username);
  if (!account || account.active !== 1 || !account.password_hash) return null;
  const ok = await verify(password, account.password_hash);
  if (!ok) return null;
  await logActivity("auth", account.id, "login", `${account.name} signed in`, account.id);
  return { id: account.id, name: account.name, username, role: account.role };
}

/**
 * Verify a username/password without starting a session. Used for manager
 * overrides (e.g. a manager authorizing a clerk's refund). Returns the account
 * or null; the caller checks the role.
 */
export async function authorize(username: string, password: string): Promise<AuthUser | null> {
  const account = await getByUsername(username.trim());
  if (!account || account.active !== 1 || !account.password_hash) return null;
  const ok = await verify(password, account.password_hash);
  if (!ok) return null;
  return { id: account.id, name: account.name, username: account.username ?? username.trim(), role: account.role };
}

// --- account management ------------------------------------------------------

export async function listAccounts(): Promise<Technician[]> {
  return select<Technician>(
    "SELECT * FROM technicians WHERE deleted_at IS NULL ORDER BY active DESC, name",
  );
}

export async function usernameTaken(username: string): Promise<boolean> {
  const row = await getByUsername(username);
  return row !== null;
}

export async function createAccount(input: {
  name: string;
  username: string;
  password: string;
  role: TechRole;
}): Promise<number> {
  const ph = await hash(input.password);
  const result = await run(
    "INSERT INTO technicians (name, username, role, color, active, password_hash) VALUES (?1, ?2, ?3, '#3B82F6', 1, ?4)",
    [input.name, input.username, input.role, ph],
  );
  await logActivity("auth", result.lastInsertId, "created", `Created ${input.role} account ${input.username}`);
  return result.lastInsertId;
}

export async function resetPassword(id: number, password: string): Promise<void> {
  const ph = await hash(password);
  await run("UPDATE technicians SET password_hash = ?1 WHERE id = ?2", [ph, id]);
}

export async function setAccountRole(id: number, role: TechRole): Promise<void> {
  await run("UPDATE technicians SET role = ?1 WHERE id = ?2", [role, id]);
}

export async function deactivateAccount(id: number): Promise<void> {
  await softDelete("technicians", id);
}
