//! Local capture saving for the microscope camera tab.
//!
//! Snapshots and recordings are written to the manager-chosen output directory
//! on THIS machine only. They are never copied into the shared database or
//! synced to other PCs. A technician can separately choose to upload a capture
//! to a ticket, which goes through the normal attachment store.

use std::path::Path;

/// Reduce a filename to a safe single segment (no path traversal, no separators).
fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "capture".to_string()
    } else {
        trimmed
    }
}

/// Write `data` to `<dir>/<file_name>`, creating the directory if needed.
/// Returns the absolute path written. Shared by the local command and the host
/// server (which writes client captures into the host's own output folder).
pub(crate) fn write_capture(dir: &str, file_name: &str, data: &[u8]) -> Result<String, String> {
    if dir.trim().is_empty() {
        return Err("No capture folder is set. Ask a manager to set one in Settings.".into());
    }
    let base = Path::new(dir);
    std::fs::create_dir_all(base).map_err(|e| format!("create folder: {e}"))?;
    let path = base.join(safe_name(file_name));
    std::fs::write(&path, data).map_err(|e| format!("write file: {e}"))?;
    Ok(path.display().to_string())
}

/// Save a capture to a local folder (standalone / host mode).
#[tauri::command]
pub fn save_capture(dir: String, file_name: String, data: Vec<u8>) -> Result<String, String> {
    write_capture(&dir, &file_name, &data)
}
