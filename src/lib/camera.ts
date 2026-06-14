import { invoke } from "@tauri-apps/api/core";

/**
 * Save raw capture bytes to `<dir>/<fileName>` on this machine and return the
 * absolute path written. Used by the microscope tab for snapshots and clips.
 */
export function saveCapture(dir: string, fileName: string, data: Uint8Array): Promise<string> {
  return invoke<string>("save_capture", { dir, fileName, data });
}
