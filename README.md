<div align="center">

<img src="userrepair-app-icon.png" width="150" alt="userrepair logo" />

# userrepair

**The offline-first point of sale and shop manager built for board-level electronics repair.**

Repair tickets - inventory with barcodes - microsoldering reference - point of sale - rewards - employee accounts, all on the shop's own machine.

![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57?logo=sqlite&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-0078D6?logo=windows&logoColor=white)
![Offline](https://img.shields.io/badge/Works-offline-2ea44f)

</div>

---

## Contents

- [Why userrepair](#why-userrepair)
- [Features](#features)
- [Requirements](#requirements)
- [Install and run](#install-and-run)
- [First-run setup](#first-run-setup)
- [Roles](#roles)
- [Payments, rewards, and configuration](#payments-rewards-and-configuration)
- [Ringing out a repair ticket](#ringing-out-a-repair-ticket)
- [Data, backup, and restore](#data-backup-and-restore)
- [For developers](#for-developers)

---

## Why userrepair

userrepair runs **entirely on the shop's own computer** with a local SQLite database.
There is no account to sign up for and no cloud to depend on. The only feature that
touches the internet is taking card payments through Square, which you enable and
configure yourself. Everything else, including a built-in catalog of thousands of real
parts and hundreds of device board revisions, works with no connection at all.

Built with **Tauri 2 (Rust)** + **React + TypeScript**.

---

## Features

### 🧾 Point of sale

| | |
|---|---|
| **Tenders** | Cash (with change due), keyed card and Square Terminal, redeem points, or any **split** across them |
| **Ring out tickets** | Look up an open repair by customer phone or name and pull its parts and labor into the cart |
| **Barcode scanner** | Any generic USB scanner adds items to the cart instantly |
| **Refunds / voids** | Reverse a sale (refunds card tenders via Square, restores stock); manager approval above a set amount |
| **Receipts** | On-screen breakdown, change given, points earned, and a link to the Square receipt |

### 🔧 Repair shop

| Area | What you get |
|---|---|
| **Tickets** | Drag-and-drop board, full status flow, timeline, notes, parts that deduct stock, labor by the hour |
| **Customers** | Profiles, device + repair history, lifetime value, duplicate detection, tags, rewards balance |
| **Devices** | Brand / model / model-number, IMEI check, per-model repair history |
| **Inventory** | Locations, suppliers, low-stock alerts, audit log, and a **printable barcode label** per item |
| **Microsoldering** | Measurements with known-good reference values per board revision |
| **Board tools** | Test-point, net, and component indices per board |

### 📚 Built in, offline

- **Parts reference**: ~3,900 real parts, ICs, microcontrollers, and single-board computers, searchable.
- **Board revisions**: 300+ devices (phones, tablets, consoles) with component references.
- **Knowledge base**: rich-text articles with wiki links, backlinks, and version history.

### 🎁 Business

- **Rewards program**: earn points per dollar, redeem as a discount, configurable rates, full ledger.
- **Accounts and roles**: owner, manager, technician, clerk, with Argon2-hashed passwords.
- **Financial**: revenue / expense, P&L, invoices. **Reporting** with CSV export.
- **Extras**: global search (`Ctrl+K`), backup and restore, your own logo, dark mode, plugin foundation.

---

## Requirements

| | |
|---|---|
| **OS** | Windows 10 / 11 (WebView2 is preinstalled on 11; install it on 10 if missing) |
| **Node.js** | 18 or newer, with npm |
| **Rust** | stable, via [rustup](https://rustup.rs/) |
| **Build tools** | Microsoft C++ Build Tools (Desktop development with C++) |

Full Tauri prerequisites: <https://v2.tauri.app/start/prerequisites/>

---

## Install and run

```bash
npm install        # restore dependencies
npm run tauri:dev  # run the app with hot reload
```

The first launch opens the **setup wizard**.

### Build an installer

```bat
build.bat
```

This builds and drops the **standalone .exe** plus the **NSIS and MSI installers**
into a `Software/` folder. (Or run `npm run tauri:build` directly.)

---

## First-run setup

A fresh install has no accounts, so the **setup wizard** runs first and asks for:

1. **Business name** (and optional phone / email)
2. An optional **shop logo** (shown in the app; does **not** change the application icon)
3. The **owner account**: your name, a username, and a password

Finish, and you are signed straight in as the owner. Closing the app signs you out, so
the next person signs in fresh.

---

## Roles

| Role | Access |
|---|---|
| **Owner / Manager** | Everything |
| **Technician** | Tickets, customers, devices, stock, bench tools, knowledge |
| **Clerk** | Point of sale, sales history, knowledge, stock |

Create accounts under **Settings → Staff** (owner / manager only).

---

## Payments, rewards, and configuration

Everything is under **Settings**:

- **General** - business info, **logo upload**, tax rate, labor hourly rate.
- **Payments (Square)** - enable Square, environment, Application ID, Access Token, Location ID,
  optional Terminal device id, and **Save & test connection**. Card data is tokenized in the
  app; the charge is made from the Rust backend so your **access token never leaves the machine**.
  Includes a manual refund tool. Refunds over a set amount require manager approval.
- **Rewards** - turn the program on and set points-per-dollar and redemption value.
- **Staff** - create accounts, reset passwords, deactivate.

---

## Ringing out a repair ticket

```
Technician                          Clerk (Point of Sale)
-----------                         ---------------------
Open the ticket            ──▶      Search "Ring out a ticket" by phone / name
Add parts (deducts stock)           Pick the ticket → parts + labor load to cart
Add labor (hours × rate)            Take payment (cash / card / Terminal / points / split)
                                    Finish → sale records, ticket marked Completed
```

Walk-in product sales do not need a customer, and you can **add a customer on the spot** at
checkout to start earning rewards.

---

## Data, backup, and restore

- All data lives in a local SQLite database in the OS app-data folder
  (`%APPDATA%\com.userrepair.app\`), next to an `attachments/` folder.
- The built-in parts / board / knowledge catalog ships with the app.
- **Backup & Restore** exports the database and attachments as one ZIP and restores from it.

> Money is stored as integer cents, dates as UTC, and deletes are soft, so history is preserved.

---

## For developers

<details>
<summary><b>Stack, layout, scripts, and architecture</b> (click to expand)</summary>

### Stack

Tauri 2.11 (Rust) + React 18 + TypeScript (strict, no `any`) + Vite 6, Tailwind v3 with
shadcn/ui (Radix). Zustand state, TanStack Table + Virtual, React Hook Form + Zod, TipTap,
Recharts, JsBarcode, and `tauri-plugin-sql` (SQLite + FTS5). Card payments use the Square Web
Payments SDK (frontend) and the Square Payments / Refunds / Terminal APIs (Rust via reqwest).
Passwords use Argon2id.

### Scripts

| Command | What it does |
|---|---|
| `npm run tauri:dev` | Run the full app with hot reload |
| `npm run dev` | Vite only, in a browser (no native commands) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run build` | Typecheck + Vite production build |
| `npm run tauri:build` | Native release build (installers) |
| `node scripts/seed-reference.mjs` | Regenerate the parts / board / article seed SQL |
| `npx tauri icon userrepair-app-icon.png` | Expand an icon into the full set |

### Project layout

```
src/                  React + TypeScript frontend
  routes/             one page per module (POS, tickets, inventory, ...)
  components/         ui/ (shadcn), layout/, shared/, pos/, customers/
  lib/                db.ts, repos/ (data access), validators, format, roles, image
  stores/             Zustand (auth, theme, ui, brand)
  hooks/              useAsync, useBarcodeScanner
  types/              shared types (no any)
src-tauri/            Rust backend
  src/db/             migrations.rs + schema.sql + seed_*.sql
  src/commands/       db_tx, square, auth, backup, attachments, system
  capabilities/       Tauri 2 ACL
scripts/              icon + catalog generators
plugins/              example plugin manifest
```

### Architecture

- CRUD runs in the frontend through a typed data layer (`src/lib/db.ts` + per-domain
  repositories in `src/lib/repos/`) on top of `tauri-plugin-sql`.
- Multi-table writes (consume part + decrement stock + audit) run through the native `db_tx`
  command so they are atomic on one connection.
- The schema is created by versioned migrations on first launch. The reference catalog is
  generated by `scripts/seed-reference.mjs` into the seed SQL files.
- Native Rust commands are limited to what the webview cannot do safely: `db_tx`, Square
  payment / refund / terminal calls, password hashing, attachment storage with hash-dedup,
  backup / restore ZIPs, and shell-open for boardview / PDF files.
- Conventions: integer-cent money, ISO 8601 UTC dates, soft deletes, foreign keys on,
  transactional multi-table writes.

### Verifying a change

```bash
npm run typecheck            # frontend types
npm run build                # frontend build
cd src-tauri && cargo check  # Rust backend
```

</details>
