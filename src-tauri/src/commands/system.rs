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
