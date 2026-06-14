//! Backup and restore. A backup is a single ZIP containing the SQLite database
//! files (`db/`) and the attachments tree (`attachments/`). Restore replaces the
//! current database and attachments with the archive contents.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

#[derive(Serialize)]
pub struct BackupResult {
    /// Absolute path to the written ZIP (chosen by the user via a save dialog).
    pub path: String,
    /// Size of the written archive in bytes.
    pub size: u64,
    /// Number of files included.
    pub file_count: u32,
}

/// Create a backup ZIP at `dest_zip` containing the database files and the
/// attachments directory. Returns the archive path, size, and file count.
#[tauri::command]
pub fn backup_create(app: AppHandle, dest_zip: String) -> Result<BackupResult, String> {
    let db_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let attachments_dir = data_dir.join("attachments");

    let file = File::create(&dest_zip).map_err(|e| format!("create zip failed: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut file_count: u32 = 0;

    // Database files: userrepair.db plus any -wal / -shm sidecars.
    for name in ["userrepair.db", "userrepair.db-wal", "userrepair.db-shm"] {
        let p = db_dir.join(name);
        if p.exists() {
            add_file(&mut zip, &p, &format!("db/{name}"), opts)?;
            file_count += 1;
        }
    }

    // Attachments tree, preserving relative structure under `attachments/`.
    if attachments_dir.exists() {
        for entry in WalkDir::new(&attachments_dir).into_iter().flatten() {
            if entry.file_type().is_file() {
                let rel = entry
                    .path()
                    .strip_prefix(&data_dir)
                    .map_err(|e| e.to_string())?;
                let zip_name = rel.to_string_lossy().replace('\\', "/");
                add_file(&mut zip, entry.path(), &zip_name, opts)?;
                file_count += 1;
            }
        }
    }

    zip.finish().map_err(|e| format!("finalize zip failed: {e}"))?;
    let size = fs::metadata(&dest_zip).map(|m| m.len()).unwrap_or(0);

    Ok(BackupResult {
        path: dest_zip,
        size,
        file_count,
    })
}

/// Restore from a backup ZIP at `src_zip`. Database files are written back into
/// the app config dir and attachments into the app-data dir, overwriting the
/// current data. Returns the number of files restored. The caller is expected to
/// confirm with the user and reload the app afterward.
#[tauri::command]
pub fn backup_restore(app: AppHandle, src_zip: String) -> Result<u32, String> {
    let db_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let file = File::open(&src_zip).map_err(|e| format!("open zip failed: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip failed: {e}"))?;

    let mut restored: u32 = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.ends_with('/') {
            continue;
        }

        // Map archive paths back to their destinations and reject traversal.
        let dest: PathBuf = if let Some(rest) = name.strip_prefix("db/") {
            if rest.contains("..") {
                return Err("unsafe path in archive".into());
            }
            db_dir.join(rest)
        } else if name.starts_with("attachments/") {
            if name.contains("..") {
                return Err("unsafe path in archive".into());
            }
            data_dir.join(&name)
        } else {
            continue;
        };

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        fs::write(&dest, &buf).map_err(|e| e.to_string())?;
        restored += 1;
    }

    Ok(restored)
}

/// Add a single on-disk file to the archive under `zip_name`.
fn add_file(
    zip: &mut zip::ZipWriter<File>,
    path: &Path,
    zip_name: &str,
    opts: SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(zip_name, opts).map_err(|e| e.to_string())?;
    let mut f = File::open(path).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    zip.write_all(&buf).map_err(|e| e.to_string())?;
    Ok(())
}
