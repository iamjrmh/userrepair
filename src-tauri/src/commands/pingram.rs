//! Pingram (formerly NotificationAPI) SMS sending.
//!
//! Real A2P 10DLC carrier SMS via Pingram's REST API: `POST {base_url}/sms` with
//! a Bearer API key (the `pingram_sk_...` server key). The body is flat:
//! `{ "type", "to", "message" }`, where `type` is a notification type the shop
//! created in Pingram (with an SMS channel) and `message` is the inline text.

use serde_json::json;

#[tauri::command]
pub async fn send_pingram(
    base_url: String,
    api_key: String,
    notification_type: String,
    to_number: String, // E.164, e.g. +15551234567
    message: String,
    // When the customer texts back, Pingram auto-responds with this (optional).
    auto_reply: Option<String>,
) -> Result<(), String> {
    if api_key.is_empty() || notification_type.is_empty() {
        return Err("Pingram is not fully configured (API key and notification type).".into());
    }
    let base = base_url.trim_end_matches('/');
    let url = format!("{base}/sms");
    let mut body = json!({
        "type": notification_type,
        "to": to_number,
        "message": message,
    });
    if let Some(ar) = auto_reply.filter(|s| !s.trim().is_empty()) {
        body["autoReply"] = json!({ "message": ar });
    }

    let resp = reqwest::Client::new()
        .post(&url)
        .bearer_auth(&api_key)
        .json(&body)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Could not reach Pingram: {e}"))?;

    if !resp.status().is_success() {
        let code = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Pingram error {code}: {}", text.chars().take(200).collect::<String>()));
    }
    Ok(())
}

/// Send a transactional email through Pingram: `POST {base_url}/email`. The sender
/// (`from_address` / `from_name`) is per-message, so each shop user emails from
/// their own address (e.g. `JURMR@iamjrmh.xyz`, "Jeremiah (Owner)") on the shop's
/// verified domain. `notification_type` must have its Email channel enabled.
#[tauri::command]
pub async fn send_pingram_email(
    base_url: String,
    api_key: String,
    notification_type: String,
    to: String,
    subject: String,
    html: String,
    from_name: Option<String>,
    from_address: Option<String>,
    reply_to: Option<String>,
) -> Result<(), String> {
    if api_key.is_empty() || notification_type.is_empty() {
        return Err("Pingram is not fully configured (API key and notification type).".into());
    }
    let base = base_url.trim_end_matches('/');
    let url = format!("{base}/email");
    let mut body = json!({
        "type": notification_type,
        "to": to,
        "subject": subject,
        "html": html,
    });
    if let Some(v) = from_name.filter(|s| !s.trim().is_empty()) {
        body["fromName"] = json!(v);
    }
    if let Some(v) = from_address.filter(|s| !s.trim().is_empty()) {
        body["fromAddress"] = json!(v);
    }
    if let Some(v) = reply_to.filter(|s| !s.trim().is_empty()) {
        body["replyToAddresses"] = json!([v]);
    }

    let resp = reqwest::Client::new()
        .post(&url)
        .bearer_auth(&api_key)
        .json(&body)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Could not reach Pingram: {e}"))?;

    if !resp.status().is_success() {
        let code = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Pingram error {code}: {}", text.chars().take(200).collect::<String>()));
    }
    Ok(())
}
