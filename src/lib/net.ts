/**
 * Multi-PC networking configuration and routing.
 *
 * userrepair can run in three modes, chosen on first launch and stored in
 * localStorage (so it is per-machine, not in the shared database):
 *
 *   - "standalone": single PC, local SQLite database (the default).
 *   - "host":       this PC owns the database AND serves it to other PCs on the
 *                   LAN (it starts the embedded server at launch).
 *   - "client":     this PC has no local data; every database operation and
 *                   Square call is routed to the host PC.
 *
 * The data layer (`lib/db.ts`) and the Square caller (`callCommand`) check the
 * mode here to decide between the local backend and the host PC.
 */
import { invoke } from "@tauri-apps/api/core";

export type NetMode = "standalone" | "host" | "client";

export interface NetConfig {
  mode: NetMode;
  /** Full base URL of the host PC, e.g. "http://192.168.1.50:8787" (client mode). */
  host: string;
  /** Shared access key required by the host (blank = open LAN). */
  key: string;
  /** Port the host serves on (host mode). */
  port: number;
}

const MODE_KEY = "userrepair.net.mode";
const HOST_KEY = "userrepair.net.host";
const KEY_KEY = "userrepair.net.key";
const PORT_KEY = "userrepair.net.port";

export const DEFAULT_PORT = 8787;

/** The configured mode, or null if the machine has not been set up yet. */
export function getNetMode(): NetMode | null {
  const m = localStorage.getItem(MODE_KEY);
  return m === "standalone" || m === "host" || m === "client" ? m : null;
}

export function isClient(): boolean {
  return getNetMode() === "client";
}

export function isHost(): boolean {
  return getNetMode() === "host";
}

/** Read the full network configuration (with sensible defaults). */
export function getNetConfig(): NetConfig {
  return {
    mode: getNetMode() ?? "standalone",
    host: localStorage.getItem(HOST_KEY) ?? "",
    key: localStorage.getItem(KEY_KEY) ?? "",
    port: Number(localStorage.getItem(PORT_KEY)) || DEFAULT_PORT,
  };
}

/** Persist the network configuration for this machine. */
export function setNetConfig(cfg: Partial<NetConfig> & { mode: NetMode }): void {
  localStorage.setItem(MODE_KEY, cfg.mode);
  if (cfg.host !== undefined) localStorage.setItem(HOST_KEY, cfg.host);
  if (cfg.key !== undefined) localStorage.setItem(KEY_KEY, cfg.key);
  if (cfg.port !== undefined) localStorage.setItem(PORT_KEY, String(cfg.port));
}

/** Clear the network configuration (returns the machine to "needs setup"). */
export function clearNetConfig(): void {
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(HOST_KEY);
  localStorage.removeItem(KEY_KEY);
  localStorage.removeItem(PORT_KEY);
}

interface HostResponse {
  error?: string;
  [k: string]: unknown;
}

/**
 * POST a body to the host PC and return its parsed JSON, throwing on a
 * transport failure or an `{ error }` response. Client mode only.
 */
export async function hostPost(path: string, body: unknown): Promise<HostResponse> {
  const cfg = getNetConfig();
  const res = await invoke<HostResponse>("net_post", {
    host: cfg.host,
    key: cfg.key,
    path,
    body,
  });
  if (res && typeof res.error === "string") throw new Error(res.error);
  return res;
}

/** Health probe for a candidate host (used by the setup/Settings screens). */
export async function checkHost(
  host: string,
  key: string,
): Promise<{ ok: boolean; shop: string; version: string }> {
  const res = await invoke<{ ok?: boolean; shop?: string; version?: string; error?: string }>(
    "net_health",
    { host, key },
  );
  if (res?.error) throw new Error(res.error);
  return { ok: Boolean(res?.ok), shop: res?.shop ?? "", version: res?.version ?? "" };
}

/** This machine's LAN IPv4, for showing other PCs where to connect (host mode). */
export async function getLanIp(): Promise<string> {
  return invoke<string>("host_lan_ip");
}

/** Start the embedded host server (host mode). Idempotent on the Rust side. */
export async function startHostServer(port: number, key: string): Promise<void> {
  await invoke("start_host_server", { port, key });
}

/**
 * Invoke a native command, routing it to the host PC when in client mode.
 * Used for the Square payment family so a client's charges run on the host,
 * where the access token lives. Local-only commands keep using `invoke`.
 */
export async function callCommand<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isClient()) {
    const res = await hostPost("/cmd", { name, args });
    return res.ok as T;
  }
  return invoke<T>(name, args);
}
