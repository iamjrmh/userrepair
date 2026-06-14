//! Attachment storage. Files are copied into the app-data `attachments/`
//! directory and named by their SHA-256 content hash so identical uploads are
//! stored only once (deduplication). The frontend persists the returned
//! relative path in the database; absolute paths are never stored.

use std::fs;
use std::io::Read;
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct StoredAttachment {
    /// Path relative to the app-data dir, e.g. `attachments/tickets/<hash>.png`.
    pub relative_path: String,
    /// Lowercase hex SHA-256 of the file contents.
    pub sha256: String,
    /// File size in bytes.
    pub size: u64,
    /// True when an identical file already existed (no copy was performed).
    pub deduped: bool,
}

/// Compute the SHA-256 of a file on disk. Returns the lowercase hex digest.
#[tauri::command]
pub fn attachment_hash(path: String) -> Result<String, String> {
    hash_file(Path::new(&path)).map_err(|e| e.to_string())
}

/// Copy `source_path` into `attachments/<subdir>/` inside the app-data dir,
/// deduplicating by content hash. Returns the relative path, hash, byte size,
/// and whether the file already existed.
#[tauri::command]
pub fn attachment_store(
    app: AppHandle,
    source_path: String,
    subdir: String,
) -> Result<StoredAttachment, String> {
    let src = Path::new(&source_path);
    let meta = fs::metadata(src).map_err(|e| format!("stat failed: {e}"))?;
    let size = meta.len();
    let hash = hash_file(src).map_err(|e| e.to_string())?;
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("bin")
        .to_lowercase();

    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let safe_subdir = sanitize(&subdir);
    let dir = base.join("attachments").join(&safe_subdir);
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;

    let file_name = format!("{hash}.{ext}");
    let dest = dir.join(&file_name);
    let deduped = dest.exists();
    if !deduped {
        fs::copy(src, &dest).map_err(|e| format!("copy failed: {e}"))?;
    }

    Ok(StoredAttachment {
        relative_path: format!("attachments/{safe_subdir}/{file_name}"),
        sha256: hash,
        size,
        deduped,
    })
}

/// Stream a file through SHA-256 in 64 KiB chunks so large boardview/firmware
/// dumps never load fully into memory.
fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Reduce a caller-supplied subdir to a safe single path segment.
fn sanitize(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "misc".to_string()
    } else {
        cleaned
    }
}
