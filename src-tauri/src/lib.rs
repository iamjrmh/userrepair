//! userrepair Tauri backend.
//!
//! Data-access CRUD runs in the frontend through `tauri-plugin-sql` (see
//! RESEARCH.md, section 3). The Rust side owns only the work the webview cannot
//! do safely: schema migrations, attachment storage with content-hash dedup,
//! backup/restore archives, and shell-open for external boardview/PDF files.

mod commands;
mod db;
mod server;

/// SQLite connection string. Resolved by `tauri-plugin-sql` relative to the
/// app config dir (on Windows: `%APPDATA%\com.userrepair.app`).
const DB_URL: &str = "sqlite:userrepair.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Let the microscope tab open a USB camera. WebView2 cannot show a system
    // permission prompt inside the app window, so without this it silently denies
    // getUserMedia. This flag auto-accepts the camera/mic permission using the
    // real device (it does not substitute a fake one).
    #[cfg(target_os = "windows")]
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--use-fake-ui-for-media-stream",
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, db::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::attachments::attachment_store,
            commands::attachments::attachment_hash,
            commands::backup::backup_create,
            commands::backup::backup_restore,
            commands::database::db_tx,
            commands::auth::hash_password,
            commands::auth::verify_password,
            commands::square::square_test_connection,
            commands::square::square_create_payment,
            commands::square::square_terminal_checkout,
            commands::square::square_terminal_status,
            commands::square::square_refund_payment,
            commands::system::open_external,
            commands::system::app_data_dir,
            commands::system::scan_files,
            commands::system::geocode_address,
            commands::net::net_post,
            commands::net::net_post_bytes,
            commands::net::net_health,
            commands::net::start_host_server,
            commands::net::host_lan_ip,
            commands::update::get_app_version,
            commands::update::check_for_update,
            commands::update::install_update,
            commands::camera::save_capture,
            commands::email::send_email,
            commands::pingram::send_pingram,
            commands::pingram::send_pingram_email,
        ])
        .run(tauri::generate_context!())
        .expect("error while running userrepair");
}
