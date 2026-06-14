//! Networking commands for multi-PC deployments.
//!
//! A "client" machine uses `net_post` to forward database operations and Square
//! calls to the host machine over the LAN. The "host" machine calls
//! `start_host_server` once at launch to begin serving. `host_lan_ip` is used by
//! the setup screen to tell the owner what address the other PCs should enter.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

static SERVER_STARTED: AtomicBool = AtomicBool::new(false);

/// POST a JSON body to `{host}{path}` on the host machine and return the parsed
/// JSON response. Used by the client data layer for `/db/*` and `/cmd`.
#[tauri::command]
pub async fn net_post(
    host: String,
    key: String,
    path: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let url = format!("{}{}", host.trim_end_matches('/'), path);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.post(&url).json(&body);
    if !key.is_empty() {
        req = req.header("x-ur-key", key);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("Could not reach the host PC at {host}: {e}"))?;
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Bad response from host: {e}"))
}

/// Probe a host's `/health` endpoint so the setup screen can confirm a client
/// can reach the host before saving the configuration.
#[tauri::command]
pub async fn net_health(host: String, key: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/health", host.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(&url);
    if !key.is_empty() {
        req = req.header("x-ur-key", key);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("Could not reach the host PC at {host}: {e}"))?;
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Bad response from host: {e}"))
}

/// Start the LAN host server (idempotent: subsequent calls are no-ops). Spawns
/// the axum server on a background task so the app keeps running.
#[tauri::command]
pub async fn start_host_server(app: AppHandle, port: u16, key: String) -> Result<(), String> {
    if SERVER_STARTED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::server::run_server(app, port, key).await {
            eprintln!("[userrepair] host server stopped: {e}");
            SERVER_STARTED.store(false, Ordering::SeqCst);
        }
    });
    Ok(())
}

/// Best-effort discovery of this machine's LAN IPv4 address, so the owner can
/// tell other PCs where to connect. Uses the classic "connect a UDP socket and
/// read the local address" trick (no packet is actually sent).
#[tauri::command]
pub fn host_lan_ip() -> Result<String, String> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    // 8.8.8.8 just picks the default-route interface; nothing is transmitted.
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    let ip = socket.local_addr().map_err(|e| e.to_string())?.ip();
    Ok(ip.to_string())
}
