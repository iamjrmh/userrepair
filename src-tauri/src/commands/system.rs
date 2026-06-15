//! System integration commands: open files in their OS default application and
//! expose the app-data directory to the frontend.

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

/// Open `path` (a file or URL) in the operating system's default handler. Used
/// for boardview files and schematic PDFs that have no in-app viewer. Returns
/// unit on success.
#[tauri::command]
pub async fn open_external(app: AppHandle, path: String) -> Result<(), String> {
    // tauri-plugin-shell is the plugin named in the spec; `open` is the
    // documented way to hand a file to the OS default handler.
    #[allow(deprecated)]
    app.shell().open(path, None).map_err(|e| e.to_string())
}

/// Return the absolute path to the app-data directory. The frontend joins this
/// with stored relative attachment paths to build `asset:` URLs for previews.
#[tauri::command]
pub fn app_data_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub name: String,
}

#[derive(serde::Deserialize, Default)]
struct NominatimAddress {
    house_number: Option<String>,
    road: Option<String>,
    city: Option<String>,
    town: Option<String>,
    village: Option<String>,
    hamlet: Option<String>,
    state: Option<String>,
    postcode: Option<String>,
}

#[derive(serde::Deserialize)]
struct NominatimResult {
    display_name: String,
    #[serde(default)]
    address: NominatimAddress,
}

#[derive(serde::Serialize)]
pub struct AddressSuggestion {
    /// Full readable address shown in the dropdown.
    pub label: String,
    /// Cleaned single-line address to drop into the field.
    pub value: String,
}

/// Free address autocomplete via OpenStreetMap Nominatim. Run from Rust so it can
/// send a proper User-Agent (Nominatim requires it) and is not blocked by the
/// webview CSP. Low-volume use (typing the shop address) stays within policy.
#[tauri::command]
pub async fn geocode_address(query: String) -> Result<Vec<AddressSuggestion>, String> {
    let q = query.trim();
    if q.len() < 4 {
        return Ok(vec![]);
    }
    let client = reqwest::Client::new();
    let results: Vec<NominatimResult> = client
        .get("https://nominatim.openstreetmap.org/search")
        .query(&[
            ("q", q),
            ("format", "json"),
            ("addressdetails", "1"),
            ("limit", "5"),
        ])
        .header("User-Agent", "userrepair-repair-shop-pos")
        .header("Accept-Language", "en")
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| format!("address lookup failed: {e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| format!("could not read address results: {e}"))?;

    let out = results
        .into_iter()
        .map(|r| {
            let a = &r.address;
            let line1 = [a.house_number.as_deref(), a.road.as_deref()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" ");
            let city = a
                .city
                .as_deref()
                .or(a.town.as_deref())
                .or(a.village.as_deref())
                .or(a.hamlet.as_deref());
            let city_state = [city, a.state.as_deref()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(", ");
            let line2 = [
                (!city_state.is_empty()).then_some(city_state.as_str()),
                a.postcode.as_deref(),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" ");
            let value = [line1.trim(), line2.trim()]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(", ");
            AddressSuggestion {
                label: r.display_name.clone(),
                value: if value.is_empty() { r.display_name } else { value },
            }
        })
        .collect();
    Ok(out)
}

/// Recursively scan `dir` (chosen by the user) for files with one of the given
/// extensions. Used by the boardview bulk importer to find files anywhere under
/// a folder the owner points at. Returns absolute paths and bare file names.
#[tauri::command]
pub fn scan_files(dir: String, extensions: Vec<String>) -> Result<Vec<ScannedFile>, String> {
    let base = std::path::Path::new(&dir);
    if !base.is_dir() {
        return Err("That is not a folder.".into());
    }
    let exts: Vec<String> = extensions
        .iter()
        .map(|e| e.trim_start_matches('.').to_lowercase())
        .collect();

    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(base)
        .max_depth(6)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if exts.iter().any(|e| e == &ext) {
            let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            out.push(ScannedFile {
                path: p.display().to_string(),
                name,
            });
        }
        if out.len() >= 5000 {
            break; // safety cap for huge trees
        }
    }
    Ok(out)
}
