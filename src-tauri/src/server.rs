//! LAN host server for multi-PC deployments.
//!
//! When the shop owner designates one machine as the "host", that machine runs
//! this small HTTP server bound to the local network. Other machines run
//! userrepair in "client" mode and route every database operation (and Square
//! payment) here, so all PCs share the host's single SQLite database and stay in
//! sync. The server is LAN-only and gated by a shared access key.
//!
//! Endpoints (all POST JSON unless noted, all camelCase out):
//!   GET  /health            -> { ok, shop, version }
//!   POST /db/select         { sql, params }      -> { rows }
//!   POST /db/execute        { sql, params }      -> { rowsAffected, lastInsertId }
//!   POST /db/tx             { statements }        -> { insertIds, rowsAffected }
//!   POST /cmd               { name, args }        -> { ok } | { error }
//!
//! Errors come back as { "error": "<message>" } with HTTP 200 so the client can
//! surface a readable message regardless of transport.

use std::str::FromStr;
use std::sync::Arc;

use axum::{
    extract::State,
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Column, Row, SqlitePool, TypeInfo, ValueRef};
use tauri::{AppHandle, Manager};

use crate::commands::database::{bind_json, TxStatement};

/// Shared server state: the DB pool, the access key, and the app handle (needed
/// to reach the Square commands for the `/cmd` endpoint).
struct ServerState {
    pool: SqlitePool,
    key: String,
    app: AppHandle,
}

/// Resolve the path to the shared SQLite database file.
fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("userrepair.db"))
}

/// Start serving on `0.0.0.0:port`. Runs until the process exits. Backed by a
/// small pool to the same database file the host's own app uses (WAL mode allows
/// the concurrent access).
pub async fn run_server(app: AppHandle, port: u16, key: String) -> Result<(), String> {
    let path = db_path(&app)?;
    let opts = SqliteConnectOptions::from_str(&format!("sqlite:{}", path.to_string_lossy()))
        .map_err(|e| e.to_string())?
        .create_if_missing(false)
        .foreign_keys(true)
        .busy_timeout(std::time::Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await
        .map_err(|e| format!("server db connect failed: {e}"))?;

    let state = Arc::new(ServerState { pool, key, app });

    let router = Router::new()
        .route("/health", get(health))
        .route("/db/select", post(db_select))
        .route("/db/execute", post(db_execute))
        .route("/db/tx", post(db_tx))
        .route("/cmd", post(cmd))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("failed to bind port {port}: {e}"))?;
    axum::serve(listener, router)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Constant-time-ish key check. An empty configured key disables auth (open LAN).
fn authed(headers: &HeaderMap, state: &ServerState) -> bool {
    if state.key.is_empty() {
        return true;
    }
    let given = headers
        .get("x-ur-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    given == state.key
}

fn unauthorized() -> Json<Value> {
    Json(json!({ "error": "Unauthorized: wrong or missing access key." }))
}

async fn health(State(state): State<Arc<ServerState>>) -> Json<Value> {
    let shop = setting(&state.pool, "shop.name").await;
    Json(json!({
        "ok": true,
        "shop": shop,
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn db_select(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    if !authed(&headers, &state) {
        return unauthorized();
    }
    let sql = body.get("sql").and_then(|v| v.as_str()).unwrap_or("");
    let params = body
        .get("params")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    match run_select(&state.pool, sql, &params).await {
        Ok(rows) => Json(json!({ "rows": rows })),
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn db_execute(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    if !authed(&headers, &state) {
        return unauthorized();
    }
    let sql = body.get("sql").and_then(|v| v.as_str()).unwrap_or("");
    let params = body
        .get("params")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    match run_execute(&state.pool, sql, &params).await {
        Ok((last_insert_id, rows_affected)) => {
            Json(json!({ "lastInsertId": last_insert_id, "rowsAffected": rows_affected }))
        }
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn db_tx(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    if !authed(&headers, &state) {
        return unauthorized();
    }
    let statements: Vec<TxStatement> = match body.get("statements").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(s) => s,
            Err(e) => return Json(json!({ "error": format!("bad statements: {e}") })),
        },
        None => Vec::new(),
    };
    match run_tx(&state.pool, &statements).await {
        Ok((insert_ids, rows_affected)) => {
            Json(json!({ "insertIds": insert_ids, "rowsAffected": rows_affected }))
        }
        Err(e) => Json(json!({ "error": e })),
    }
}

/// Proxy a native command (currently the Square payment family) so a client
/// machine's POS charges run from the host, where the access token lives.
async fn cmd(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    if !authed(&headers, &state) {
        return unauthorized();
    }
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let args = body.get("args").cloned().unwrap_or(Value::Null);
    let app = state.app.clone();

    let s = |key: &str| args.get(key).and_then(|v| v.as_str()).map(|s| s.to_string());
    let i = |key: &str| args.get(key).and_then(|v| v.as_i64()).unwrap_or(0);

    use crate::commands::square;
    let result: Result<Value, String> = match name {
        "square_test_connection" => square::square_test_connection(app)
            .await
            .map(|name| json!(name)),
        "square_create_payment" => square::square_create_payment(
            app,
            s("sourceId").unwrap_or_default(),
            i("amountCents"),
            s("referenceId"),
            s("note"),
        )
        .await
        .and_then(to_value),
        "square_terminal_checkout" => {
            square::square_terminal_checkout(app, i("amountCents"), s("referenceId"), s("note"))
                .await
                .and_then(to_value)
        }
        "square_terminal_status" => {
            square::square_terminal_status(app, s("checkoutId").unwrap_or_default())
                .await
                .and_then(to_value)
        }
        "square_refund_payment" => square::square_refund_payment(
            app,
            s("paymentId").unwrap_or_default(),
            i("amountCents"),
            s("reason"),
        )
        .await
        .and_then(to_value),
        other => Err(format!("Command not available over the network: {other}")),
    };

    match result {
        Ok(v) => Json(json!({ "ok": v })),
        Err(e) => Json(json!({ "error": e })),
    }
}

fn to_value<T: serde::Serialize>(v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

// --- Query execution helpers -------------------------------------------------

async fn run_select(pool: &SqlitePool, sql: &str, params: &[Value]) -> Result<Vec<Value>, String> {
    let mut query = sqlx::query(sql);
    for p in params {
        query = bind_json(query, p);
    }
    let rows = query.fetch_all(pool).await.map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        let cols = row.columns();
        let mut map = serde_json::Map::with_capacity(cols.len());
        for (idx, col) in cols.iter().enumerate() {
            map.insert(col.name().to_string(), col_to_json(row, idx)?);
        }
        out.push(Value::Object(map));
    }
    Ok(out)
}

async fn run_execute(
    pool: &SqlitePool,
    sql: &str,
    params: &[Value],
) -> Result<(i64, u64), String> {
    let mut query = sqlx::query(sql);
    for p in params {
        query = bind_json(query, p);
    }
    let r = query.execute(pool).await.map_err(|e| e.to_string())?;
    Ok((r.last_insert_rowid(), r.rows_affected()))
}

async fn run_tx(
    pool: &SqlitePool,
    statements: &[TxStatement],
) -> Result<(Vec<i64>, Vec<u64>), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut insert_ids = Vec::with_capacity(statements.len());
    let mut rows_affected = Vec::with_capacity(statements.len());
    for stmt in statements {
        let mut query = sqlx::query(&stmt.sql);
        for p in &stmt.params {
            query = bind_json(query, p);
        }
        let r = query
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("statement failed: {e}"))?;
        insert_ids.push(r.last_insert_rowid());
        rows_affected.push(r.rows_affected());
    }
    tx.commit().await.map_err(|e| format!("commit failed: {e}"))?;
    Ok((insert_ids, rows_affected))
}

/// Convert a single column of a row to JSON, keyed off the value's runtime
/// storage class so text is never coerced to a number (and vice versa).
fn col_to_json(row: &sqlx::sqlite::SqliteRow, idx: usize) -> Result<Value, String> {
    let raw = row.try_get_raw(idx).map_err(|e| e.to_string())?;
    if raw.is_null() {
        return Ok(Value::Null);
    }
    match raw.type_info().name() {
        "INTEGER" => {
            let v: i64 = row.try_get(idx).map_err(|e| e.to_string())?;
            Ok(Value::from(v))
        }
        "REAL" => {
            let v: f64 = row.try_get(idx).map_err(|e| e.to_string())?;
            Ok(Value::from(v))
        }
        "BLOB" => {
            let v: Vec<u8> = row.try_get(idx).map_err(|e| e.to_string())?;
            Ok(Value::from(v))
        }
        _ => {
            let v: String = row.try_get(idx).map_err(|e| e.to_string())?;
            Ok(Value::from(v))
        }
    }
}

/// Read one app_setting (JSON-encoded string) as plain text. Mirrors the helper
/// in the Square module.
async fn setting(pool: &SqlitePool, key: &str) -> String {
    let row = sqlx::query("SELECT value FROM app_settings WHERE key = ?1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    match row {
        Some(r) => {
            let raw: String = r.try_get("value").unwrap_or_default();
            serde_json::from_str::<Value>(&raw)
                .ok()
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or(raw)
        }
        None => String::new(),
    }
}
