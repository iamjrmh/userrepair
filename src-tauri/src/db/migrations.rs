//! Versioned migration list applied by `tauri-plugin-sql` on `Database.load`.
//!
//! Migration v1 embeds the fully commented `schema.sql` (the single source of
//! truth for the database). Future schema changes are added as additional
//! `Migration` entries with incrementing `version` numbers; never edit a
//! migration that has already shipped.

use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema: core tables, indexes, updated_at triggers, FTS5 search",
            sql: include_str!("schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "reference catalog table + FTS, device model_number column",
            sql: include_str!("0002_reference.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "seed reference catalog: parts, board revisions, known-good values, articles",
            sql: include_str!("seed_reference.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "seed microcontrollers and development boards into the reference catalog",
            sql: include_str!("seed_microcontrollers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "seed Raspberry Pi single-board computers, compute modules, and Pico boards",
            sql: include_str!("seed_raspberry_pi.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "inventory model_number and serial_number columns for resale devices",
            sql: include_str!("0006_device_inventory.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "seed board revisions for every phone/tablet model with components, test points, and known-good rails",
            sql: include_str!("seed_boards.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "seed console board revisions (PlayStation, Xbox, Nintendo, Sega, and more)",
            sql: include_str!("seed_consoles.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "seed per-device component-reference knowledge articles",
            sql: include_str!("seed_kb_devices.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "backfill brand and manufacturer part number for every reference part",
            sql: include_str!("0010_part_backfill.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "POS sales tables and Square configuration settings",
            sql: include_str!("0011_pos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "employee login accounts (username, password_hash) and owner seed",
            sql: include_str!("0012_accounts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "split payment tenders (pos_payments)",
            sql: include_str!("0013_split_payments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "customer rewards: points balance, ledger, and settings",
            sql: include_str!("0014_rewards.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "ticket edit locks to prevent concurrent edits across PCs",
            sql: include_str!("0015_ticket_locks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "notification outbox queue for offline-tolerant status emails",
            sql: include_str!("0016_notification_outbox.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "outbox is_html flag (plain text for email-to-SMS gateways)",
            sql: include_str!("0017_outbox_is_html.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "inbox for inbound SMS replies (Pingram webhook)",
            sql: include_str!("0018_inbox.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "outbox transport channel + per-user sender (Pingram email)",
            sql: include_str!("0019_outbox_pingram.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
