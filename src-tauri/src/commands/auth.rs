//! Password hashing for employee accounts (Argon2id). Hashes are stored in the
//! `technicians.password_hash` column; plaintext passwords never touch the DB.

use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};

/// Hash a password with Argon2id and a random salt. Returns the PHC string.
#[tauri::command]
pub fn hash_password(password: String) -> Result<String, String> {
    // Use a v4 UUID's 16 random bytes as the salt (avoids an extra RNG dep).
    let salt = SaltString::encode_b64(uuid::Uuid::new_v4().as_bytes()).map_err(|e| e.to_string())?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

/// Verify a password against a stored Argon2 PHC hash.
#[tauri::command]
pub fn verify_password(password: String, hash: String) -> Result<bool, String> {
    let parsed = PasswordHash::new(&hash).map_err(|e| e.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}
