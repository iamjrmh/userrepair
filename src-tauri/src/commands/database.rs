//! Atomic multi-statement writes.
//!
//! `tauri-plugin-sql` runs on a connection pool, so a BEGIN issued from one JS
//! call and an INSERT from the next can land on different connections. This
//! command opens a dedicated connection to the same SQLite file and runs the
//! whole batch inside one transaction, guaranteeing all-or-nothing semantics for
//! operations that touch several tables (e.g. consume parts + decrement stock +
//! write an audit row).

use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
pub struct TxStatement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<serde_json::Value>,
}

#[derive(Serialize)]
pub struct TxResult {
    /// `last_insert_rowid()` after each statement (0 for non-insert statements).
    pub insert_ids: Vec<i64>,
    /// Rows affected by each statement.
    pub rows_affected: Vec<u64>,
}

/// Run a list of parameterised statements inside a single transaction. Commits
/// on success, rolls back if any statement fails. Returns the insert id and
/// affected row count for each statement.
#[tauri::command]
pub async fn db_tx(app: AppHandle, statements: Vec<TxStatement>) -> Result<TxResult, String> {
    let db_path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("userrepair.db");

    let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", db_path.to_string_lossy()))
        .map_err(|e| e.to_string())?
        .create_if_missing(false)
        .foreign_keys(true)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| format!("connect failed: {e}"))?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let mut insert_ids = Vec::with_capacity(statements.len());
    let mut rows_affected = Vec::with_capacity(statements.len());

    for stmt in &statements {
        let mut query = sqlx::query(&stmt.sql);
        for p in &stmt.params {
            query = bind_json(query, p);
        }
        let result = query
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("statement failed: {e}"))?;
        insert_ids.push(result.last_insert_rowid());
        rows_affected.push(result.rows_affected());
    }

    tx.commit().await.map_err(|e| format!("commit failed: {e}"))?;
    pool.close().await;

    Ok(TxResult {
        insert_ids,
        rows_affected,
    })
}

/// Bind a JSON value to a query, mapping it to the appropriate SQLite type.
pub(crate) fn bind_json<'q>(
    query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: &'q serde_json::Value,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match value {
        serde_json::Value::Null => query.bind(Option::<String>::None),
        serde_json::Value::Bool(b) => query.bind(if *b { 1_i64 } else { 0_i64 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else {
                query.bind(n.as_f64().unwrap_or(0.0))
            }
        }
        serde_json::Value::String(s) => query.bind(s.clone()),
        // Arrays / objects are stored as their JSON text representation.
        other => query.bind(other.to_string()),
    }
}
