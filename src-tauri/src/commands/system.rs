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
