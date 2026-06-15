//! In-app update check + installer launch.
//!
//! userrepair ships as GitHub releases (an NSIS `.exe` and an MSI `.msi`). This
//! module compares the running version against the repo's latest release and,
//! only when the shop owner chooses to, downloads the installer and launches it.
//!
//! There is deliberately no auto-update and no background polling. The frontend
//! checks once when the app opens and whenever the owner clicks the update
//! button, so a new release can never interrupt a sale or a ticket edit on its
//! own - the owner decides when to install.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const GH_REPO: &str = "iamjrmh/userrepair";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const USER_AGENT: &str = "userrepair-update-check";

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

#[derive(Debug, Serialize, Clone)]
pub struct UpdateInfo {
    pub available: bool,
    pub current: String,
    pub latest: String,
    pub notes: String,
    pub asset_url: Option<String>,
    pub asset_name: Option<String>,
    pub published_at: Option<String>,
    pub html_url: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DownloadResult {
    pub path: String,
}

/// Loose semver compare: true when `latest` is strictly newer than `current`.
/// Splits on any non-digit and compares component by component, treating a
/// missing component as 0 (so "1.1" == "1.1.0").
fn is_newer(latest: &str, current: &str) -> bool {
    fn parts(v: &str) -> Vec<u64> {
        v.split(|c: char| !c.is_ascii_digit())
            .filter(|s| !s.is_empty())
            .map(|s| s.parse::<u64>().unwrap_or(0))
            .collect()
    }
    let (a, b) = (parts(latest), parts(current));
    for i in 0..a.len().max(b.len()) {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

#[tauri::command]
pub fn get_app_version() -> String {
    APP_VERSION.to_string()
}

/// Check the latest GitHub release. Reports whether a newer version exists and
/// which installer to download (prefers the `.exe` setup, falls back to `.msi`).
#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    // Use the releases list (newest first), not /releases/latest: the latest
    // endpoint returns 404 when the repo has only prereleases, which is what was
    // causing "Update check failed". The list includes prereleases.
    let url = format!("https://api.github.com/repos/{GH_REPO}/releases?per_page=10");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| format!("Could not reach GitHub: {e}"))?;
    // A private (or missing) repo returns 404 to anonymous callers, which is the
    // usual reason this fails. Say so plainly instead of a raw HTTP error.
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(
            "Updates are unavailable: the releases repository is private or not found. Make the GitHub repo public so the app can read its releases."
                .into(),
        );
    }
    let releases: Vec<GhRelease> = resp
        .error_for_status()
        .map_err(|e| format!("GitHub returned an error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Could not read the releases list: {e}"))?;

    // Newest published (non-draft) release. Drafts are not visible without auth
    // anyway, but filter for safety. No releases yet = nothing to update to.
    let Some(rel) = releases.into_iter().find(|r| !r.draft) else {
        return Ok(UpdateInfo {
            available: false,
            current: APP_VERSION.to_string(),
            latest: APP_VERSION.to_string(),
            notes: String::new(),
            asset_url: None,
            asset_name: None,
            published_at: None,
            html_url: String::new(),
        });
    };

    let latest = rel.tag_name.trim_start_matches('v').to_string();
    let available = is_newer(&latest, APP_VERSION);

    let installer = rel
        .assets
        .iter()
        .find(|a| a.name.to_lowercase().ends_with(".exe"))
        .or_else(|| rel.assets.iter().find(|a| a.name.to_lowercase().ends_with(".msi")));

    Ok(UpdateInfo {
        available,
        current: APP_VERSION.to_string(),
        latest,
        notes: rel.body.unwrap_or_default(),
        asset_url: installer.map(|a| a.browser_download_url.clone()),
        asset_name: installer.map(|a| a.name.clone()),
        published_at: rel.published_at,
        html_url: rel.html_url,
    })
}

/// Download the chosen installer to the temp dir, launch it detached, then exit
/// the app shortly after so the installer can replace the running binary.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    asset_url: String,
    asset_name: String,
) -> Result<DownloadResult, String> {
    let dest: PathBuf = std::env::temp_dir().join(&asset_name);

    let client = reqwest::Client::new();
    let bytes = client
        .get(&asset_url)
        .header("User-Agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(180))
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download error: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("read installer: {e}"))?;

    std::fs::write(&dest, &bytes).map_err(|e| format!("write installer: {e}"))?;
    let dest_str = dest.display().to_string();

    // Install silently (no wizard) and relaunch the app afterwards. A silent
    // NSIS / MSI install does not restart the app on its own, so a detached shell
    // helper waits ~2s for this app to exit, runs the installer, then starts the
    // freshly installed binary back up.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let app_exe = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let install_cmd = if asset_name.to_lowercase().ends_with(".msi") {
            format!("start \"\" /wait msiexec /i \"{dest_str}\" /qn /norestart")
        } else {
            // NSIS setup: /S is a fully silent install.
            format!("start \"\" /wait \"{dest_str}\" /S")
        };
        let relaunch = if app_exe.is_empty() {
            String::new()
        } else {
            format!(" & start \"\" \"{app_exe}\"")
        };
        // ping is a console-safe ~2s sleep so the app is fully closed before the
        // installer replaces its binary.
        let line = format!("/C ping -n 3 127.0.0.1 >nul & {install_cmd}{relaunch}");

        std::process::Command::new("cmd")
            .raw_arg(&line)
            .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("spawn installer: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new(&dest)
            .spawn()
            .map_err(|e| format!("spawn installer: {e}"))?;
    }

    // Quit so the installer can replace the binary; the helper relaunches us.
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(700));
        app_clone.exit(0);
    });

    Ok(DownloadResult { path: dest_str })
}
