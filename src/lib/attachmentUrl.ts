import { invoke, convertFileSrc } from "@tauri-apps/api/core";

// The app-data dir is constant for the process; fetch it once.
let dirPromise: Promise<string> | null = null;
function appDataDir(): Promise<string> {
  if (!dirPromise) dirPromise = invoke<string>("app_data_dir");
  return dirPromise;
}

/**
 * Build a webview-loadable asset URL for a stored attachment's relative path
 * (e.g. "attachments/tickets/<hash>.png"). The asset protocol scope already
 * allows the app-data attachments directory.
 */
export async function attachmentUrl(relativePath: string): Promise<string> {
  const base = await appDataDir();
  const sep = base.endsWith("\\") || base.endsWith("/") ? "" : "\\";
  const abs = `${base}${sep}${relativePath}`.replace(/\//g, "\\");
  return convertFileSrc(abs);
}
