//! Transactional email for repair-status notifications.
//!
//! Sends through the shop's own SMTP provider (e.g. Gmail with an app password,
//! or a free transactional tier). The blocking lettre transport runs on a
//! blocking task so the async runtime is never stalled. rustls is used for TLS
//! to stay consistent with reqwest and off OpenSSL.

use lettre::message::header::ContentType;
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};

#[allow(clippy::too_many_arguments)]
fn send_blocking(
    smtp_host: String,
    smtp_port: u16,
    smtp_user: String,
    smtp_pass: String,
    from_name: String,
    from_email: String,
    to: String,
    subject: String,
    html_body: String,
) -> Result<(), String> {
    let from_str = if from_name.trim().is_empty() {
        from_email.clone()
    } else {
        format!("{from_name} <{from_email}>")
    };
    let from: Mailbox = from_str
        .parse()
        .map_err(|e| format!("Invalid sender address: {e}"))?;
    let to_mb: Mailbox = to
        .parse()
        .map_err(|e| format!("Invalid recipient address: {e}"))?;

    let email = Message::builder()
        .from(from)
        .to(to_mb)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(html_body)
        .map_err(|e| format!("Could not build the email: {e}"))?;

    let creds = Credentials::new(smtp_user, smtp_pass);
    // Port 465 = implicit TLS; anything else (587) = STARTTLS.
    let builder = if smtp_port == 465 {
        SmtpTransport::relay(&smtp_host).map_err(|e| e.to_string())?
    } else {
        SmtpTransport::starttls_relay(&smtp_host).map_err(|e| e.to_string())?
    };
    let mailer = builder.port(smtp_port).credentials(creds).build();
    mailer
        .send(&email)
        .map_err(|e| format!("Send failed: {e}"))?;
    Ok(())
}

/// Send one HTML email via SMTP. Credentials come from the caller (read from the
/// shop's settings), so the same path works for Gmail today or any provider later.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_email(
    smtp_host: String,
    smtp_port: u16,
    smtp_user: String,
    smtp_pass: String,
    from_name: String,
    from_email: String,
    to: String,
    subject: String,
    html_body: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        send_blocking(
            smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, to, subject,
            html_body,
        )
    })
    .await
    .map_err(|e| format!("email task failed: {e}"))?
}
