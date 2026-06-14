/**
 * Update check + installer launch (mirrors the native commands in
 * src-tauri/src/commands/update.rs). The app never auto-updates: it checks on
 * open and on demand, and only downloads/installs when the owner confirms.
 */
import { invoke } from "@tauri-apps/api/core";

export interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  notes: string;
  asset_url: string | null;
  asset_name: string | null;
  published_at: string | null;
  html_url: string;
}

export interface DownloadResult {
  path: string;
}

export function checkForUpdate(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("check_for_update");
}

export function installUpdate(assetUrl: string, assetName: string): Promise<DownloadResult> {
  return invoke<DownloadResult>("install_update", { assetUrl, assetName });
}
