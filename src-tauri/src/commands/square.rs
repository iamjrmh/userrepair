//! Square POS integration. Card tokenization happens in the webview via the Web
//! Payments SDK (PCI-compliant); the actual charge is made here so the access
//! token never leaves the Rust backend. Supports keyed payments and Square
//! Terminal. This is the one place the app talks to the network (the POS
//! plugin's documented `net` capability).

use serde::Serialize;
use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::str::FromStr;
use tauri::{AppHandle, Manager};

const SQUARE_VERSION: &str = "2026-01-22";

struct SquareConfig {
    environment: String,
    access_token: String,
    location_id: String,
    device_id: String,
    currency: String,
}

impl SquareConfig {
    fn base_url(&self) -> &'static str {
        if self.environment == "sandbox" {
            "https://connect.squareupsandbox.com"
        } else {
            "https://connect.squareup.com"
        }
    }
}

async fn open_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let db_path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("userrepair.db");
    let opts = SqliteConnectOptions::from_str(&format!("sqlite:{}", db_path.to_string_lossy()))
        .map_err(|e| e.to_string())?
        .create_if_missing(false);
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .map_err(|e| e.to_string())
}

/// Read one app_setting. Values are JSON-encoded strings, so decode them.
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

async fn load_config(app: &AppHandle) -> Result<SquareConfig, String> {
    let pool = open_pool(app).await?;
    let environment = setting(&pool, "square.environment").await;
    let access_token = setting(&pool, "square.access_token").await;
    let location_id = setting(&pool, "square.location_id").await;
    let device_id = setting(&pool, "square.device_id").await;
    let mut currency = setting(&pool, "square.currency").await;
    pool.close().await;

    if access_token.is_empty() {
        return Err("Square access token is not configured (Settings > Payments).".into());
    }
    if location_id.is_empty() {
        return Err("Square location id is not configured (Settings > Payments).".into());
    }
    if currency.is_empty() {
        currency = "USD".to_string();
    }
    Ok(SquareConfig {
        environment: if environment.is_empty() {
            "production".into()
        } else {
            environment
        },
        access_token,
        location_id,
        device_id,
        currency,
    })
}

fn client(cfg: &SquareConfig) -> Result<reqwest::Client, String> {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", cfg.access_token)).map_err(|e| e.to_string())?,
    );
    headers.insert("Square-Version", HeaderValue::from_static(SQUARE_VERSION));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

/// Extract a human-readable message from a Square error response body.
fn square_error(body: &Value) -> String {
    body.get("errors")
        .and_then(|e| e.as_array())
        .and_then(|a| a.first())
        .and_then(|e| {
            e.get("detail")
                .and_then(|d| d.as_str())
                .or_else(|| e.get("code").and_then(|c| c.as_str()))
        })
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Square request failed".to_string())
}

#[derive(Serialize)]
pub struct PaymentResult {
    pub id: String,
    pub status: String,
    pub card_brand: String,
    pub last4: String,
    pub receipt_url: String,
    pub amount_cents: i64,
}

fn parse_payment(p: &Value) -> PaymentResult {
    let card = p.get("card_details").and_then(|c| c.get("card"));
    PaymentResult {
        id: p.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        status: p.get("status").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        card_brand: card
            .and_then(|c| c.get("card_brand"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        last4: card
            .and_then(|c| c.get("last_4"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        receipt_url: p
            .get("receipt_url")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        amount_cents: p
            .get("amount_money")
            .and_then(|m| m.get("amount"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
    }
}

/// Verify the configured Square credentials by fetching the location. Returns
/// the location name on success.
#[tauri::command]
pub async fn square_test_connection(app: AppHandle) -> Result<String, String> {
    let cfg = load_config(&app).await?;
    let url = format!("{}/v2/locations/{}", cfg.base_url(), cfg.location_id);
    let resp = client(&cfg)?.get(url).send().await.map_err(|e| e.to_string())?;
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    match body.get("location") {
        Some(loc) => Ok(loc
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("Connected")
            .to_string()),
        None => Err(square_error(&body)),
    }
}

/// Charge a tokenized card (keyed entry). `source_id` is the token produced by
/// the Web Payments SDK in the webview. Returns the payment id, status, card
/// brand/last4, and receipt URL.
#[tauri::command]
pub async fn square_create_payment(
    app: AppHandle,
    source_id: String,
    amount_cents: i64,
    reference_id: Option<String>,
    note: Option<String>,
) -> Result<PaymentResult, String> {
    let cfg = load_config(&app).await?;
    let url = format!("{}/v2/payments", cfg.base_url());
    let body = json!({
        "source_id": source_id,
        "idempotency_key": uuid::Uuid::new_v4().to_string(),
        "amount_money": { "amount": amount_cents, "currency": cfg.currency },
        "location_id": cfg.location_id,
        "reference_id": reference_id,
        "note": note,
        "autocomplete": true
    });
    let resp = client(&cfg)?
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let payload: Value = resp.json().await.map_err(|e| e.to_string())?;
    let payment = payload.get("payment").ok_or_else(|| square_error(&payload))?;
    Ok(parse_payment(payment))
}

#[derive(Serialize)]
pub struct TerminalResult {
    pub checkout_id: String,
    pub status: String,
    pub payment_id: String,
}

fn parse_terminal(c: &Value) -> TerminalResult {
    TerminalResult {
        checkout_id: c.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        status: c.get("status").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        payment_id: c
            .get("payment_ids")
            .and_then(|a| a.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
    }
}

/// Start a Square Terminal checkout on the paired device. Returns the checkout
/// id and initial status (PENDING). Poll `square_terminal_status` for completion.
#[tauri::command]
pub async fn square_terminal_checkout(
    app: AppHandle,
    amount_cents: i64,
    reference_id: Option<String>,
    note: Option<String>,
) -> Result<TerminalResult, String> {
    let cfg = load_config(&app).await?;
    if cfg.device_id.is_empty() {
        return Err("Square Terminal device id is not configured (Settings > Payments).".into());
    }
    let url = format!("{}/v2/terminals/checkouts", cfg.base_url());
    let body = json!({
        "idempotency_key": uuid::Uuid::new_v4().to_string(),
        "checkout": {
            "amount_money": { "amount": amount_cents, "currency": cfg.currency },
            "reference_id": reference_id,
            "note": note,
            "device_options": { "device_id": cfg.device_id }
        }
    });
    let resp = client(&cfg)?
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let payload: Value = resp.json().await.map_err(|e| e.to_string())?;
    let checkout = payload.get("checkout").ok_or_else(|| square_error(&payload))?;
    Ok(parse_terminal(checkout))
}

#[derive(Serialize)]
pub struct RefundResult {
    pub id: String,
    pub status: String,
    pub amount_cents: i64,
}

/// Refund (fully or partially) a Square payment by its id. Used to void a sale
/// or reverse an orphaned charge.
#[tauri::command]
pub async fn square_refund_payment(
    app: AppHandle,
    payment_id: String,
    amount_cents: i64,
    reason: Option<String>,
) -> Result<RefundResult, String> {
    let cfg = load_config(&app).await?;
    let url = format!("{}/v2/refunds", cfg.base_url());
    let body = json!({
        "idempotency_key": uuid::Uuid::new_v4().to_string(),
        "payment_id": payment_id,
        "amount_money": { "amount": amount_cents, "currency": cfg.currency },
        "reason": reason
    });
    let resp = client(&cfg)?
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let payload: Value = resp.json().await.map_err(|e| e.to_string())?;
    let refund = payload.get("refund").ok_or_else(|| square_error(&payload))?;
    Ok(RefundResult {
        id: refund.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        status: refund.get("status").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        amount_cents: refund
            .get("amount_money")
            .and_then(|m| m.get("amount"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
    })
}

/// Poll a Terminal checkout's status (COMPLETED / CANCELED / etc.).
#[tauri::command]
pub async fn square_terminal_status(
    app: AppHandle,
    checkout_id: String,
) -> Result<TerminalResult, String> {
    let cfg = load_config(&app).await?;
    let url = format!("{}/v2/terminals/checkouts/{}", cfg.base_url(), checkout_id);
    let resp = client(&cfg)?.get(url).send().await.map_err(|e| e.to_string())?;
    let payload: Value = resp.json().await.map_err(|e| e.to_string())?;
    let checkout = payload.get("checkout").ok_or_else(|| square_error(&payload))?;
    Ok(parse_terminal(checkout))
}
