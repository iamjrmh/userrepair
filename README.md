# userrepair

A professional, fully offline desktop application for board-level electronics
repair shops: repair tickets, customers, devices, inventory with barcodes,
microsoldering measurements, a built-in parts/board knowledge base, point of
sale with Square, a customer rewards program, employee accounts with roles, and
financial reporting. Built with Tauri 2 (Rust) + React + TypeScript and a local
SQLite database.

> Runs entirely on the shop's machine. The only network feature is taking card
> payments through Square (which you enable and configure). Everything else works
> with no internet.

---

## Features

- **Point of Sale**: sell parts, devices, and labor. Cash (with change due), keyed
  card and Square Terminal, and any **split** across them. Redeem reward points.
  **Ring out an open repair ticket** by customer phone/name to pull its parts and
  labor straight into the cart. Refund/void with a manager override above a
  configurable amount. **USB barcode scanner** adds items to the cart.
- **Repair tickets** with a drag-and-drop board, full status flow, timeline,
  internal/customer notes, parts that deduct stock, and labor by the hour. Device
  check-in requires a customer account.
- **Customers** with profiles, device and repair history, lifetime value,
  duplicate detection, tags, communication log, and a **rewards** balance + history.
- **Devices** with brand/model/model-number, IMEI validation, and per-model
  repair history.
- **Inventory** with locations, suppliers, low-stock alerts, an audit log, and a
  **printable CODE128 barcode label** for every item (auto-generated SKU).
- **Parts Reference**: a built-in, searchable catalog of ~3,900 real parts,
  components, ICs, microcontrollers, and single-board computers, plus 300+ device
  board revisions and per-device component references.
- **Microsoldering & Board Tools**: log measurements with a known-good reference
  set per board revision; test-point, net, and component indices.
- **Knowledge Base**: rich-text articles with wiki links, backlinks, categories,
  and version history.
- **Rewards program**: earn points per dollar, redeem as a discount at POS,
  configurable rates, full ledger, and manager point adjustments.
- **Accounts & roles**: owner, manager, technician, clerk. Argon2-hashed
  passwords. Role-gated tabs.
- **Financial** (revenue/expense, P&L, invoices), **Reporting** with CSV export,
  **global search** (Ctrl+K), **backup & restore**, and a **plugin foundation**.
- Dark mode by default, your own logo, collapsible sidebar, virtualized tables.

---

## Requirements

- **Windows 10/11** (primary target). The WebView2 runtime is preinstalled on
  Windows 11; on Windows 10 install it from Microsoft if missing.
- **Node.js** 18 or newer, and npm.
- **Rust** (stable) via [rustup](https://rustup.rs/).
- **Microsoft C++ Build Tools** (Desktop development with C++), required by Tauri.

See <https://v2.tauri.app/start/prerequisites/> for the full Tauri prerequisite
list for your OS.

---

## Install and run

```bash
# 1. Get the code, then from the project folder:
npm install

# 2. Run the app (hot-reload dev mode):
npm run tauri:dev
```

The first launch opens the **setup wizard** (see below).

### Build an installer

Windows, one step (builds and drops the installers + standalone .exe into a
`Software/` folder):

```bat
build.bat
```

Or directly:

```bash
npm run tauri:build
```

Installers land in `src-tauri/target/release/bundle/` (NSIS `-setup.exe` and MSI).

---

## First-run setup

On a fresh install there are no accounts. The **setup wizard** asks for:

- **Business name** (and optional phone/email)
- An optional **shop logo** (shown in the app; this does not change the
  application icon)
- The **owner account**: your name, a username, and a password

Finish setup and you are signed straight in as the owner. From there, create
**manager / technician / clerk** accounts under **Settings > Staff**.

> Sign-out happens automatically when you close the app, so the next person signs
> in fresh on reopen.

### Roles at a glance

- **Owner / Manager**: everything.
- **Technician**: tickets, customers, devices, stock, bench tools, knowledge.
- **Clerk**: point of sale, sales history, knowledge, stock.

---

## Configuring payments, rewards, and more

Everything is under **Settings** (owner/manager):

- **General**: business info, logo, tax rate, and the labor hourly rate.
- **Payments (Square)**: enable Square, environment (Production/Sandbox),
  Application ID, Access Token, Location ID, optional Terminal device id, and a
  **Save & test connection** button. Card data is tokenized in the app; the charge
  is made from the Rust backend so your access token stays on the machine. There
  is also a manual refund-by-payment-id tool. Refunds above a set amount require a
  manager/owner to approve with their credentials.
- **Rewards**: turn the program on, set points earned per dollar and the
  redemption value per point.
- **Staff**: create accounts, reset passwords, deactivate.

---

## Taking payment and ringing out a ticket

1. A technician opens the repair ticket, adds **parts** (deducts stock) and
   **labor** (hours x rate).
2. At the counter, open **Point of Sale**, type the customer's phone or name in
   **Ring out a ticket**, and pick the ticket. Its parts and labor load into the
   cart.
3. Take payment (cash / card / Terminal / points, or any split). On finish, the
   sale records, points earn/redeem, and the ticket is marked Completed.

Walk-in product sales do not need a customer; you can also **add a customer
on the spot** at checkout to start earning rewards.

---

## Data, backup, and restore

- All data lives in a local SQLite database in the OS app-data directory
  (Windows: `%APPDATA%\com.userrepair.app\`), alongside an `attachments/` folder.
- The built-in parts/board/knowledge catalog ships with the app and loads on first
  launch.
- **Backup & Restore** exports the database and attachments as a single ZIP and
  restores from one. Use it before big changes and on a schedule.

Money is stored as integer cents, dates as UTC, and deletions are soft, so
history is preserved.

---

## For developers

### Stack

Tauri 2.11 (Rust backend) + React 18 + TypeScript (strict, no `any`) + Vite 6.
Tailwind CSS v3 with shadcn/ui (Radix) components. Zustand for state, TanStack
Table + Virtual for data grids, React Hook Form + Zod for forms, TipTap for rich
text, Recharts for charts, JsBarcode for labels, and `tauri-plugin-sql` (SQLite +
FTS5) for storage. Card payments use the Square Web Payments SDK (frontend) and
the Square Payments/Refunds/Terminal APIs (Rust via reqwest). Passwords use
Argon2id.

### Scripts

```bash
npm run dev          # Vite only, in a browser (no native commands)
npm run tauri:dev    # full app with hot reload
npm run typecheck    # tsc --noEmit (strict)
npm run build        # typecheck + Vite production build
npm run tauri:build  # native release build (installers)

node scripts/seed-reference.mjs   # regenerate the parts/board/article seed SQL
node scripts/make-icon.mjs        # regenerate the brand icon source
npx tauri icon userrepair-app-icon.png   # expand an icon into the full set
```

### Project layout

```
src/                     React + TypeScript frontend
  routes/                one page per module (POS, tickets, inventory, ...)
  components/            ui/ (shadcn), layout/, shared/, pos/, customers/
  lib/                   db.ts, repos/ (data access), validators, format, roles, image
  stores/                Zustand (auth, theme, ui, brand)
  hooks/                 useAsync, useBarcodeScanner
  types/                 shared types (no any)
src-tauri/               Rust backend
  src/db/                migrations.rs + schema.sql + seed_*.sql
  src/commands/          db_tx, square, auth, backup, attachments, system
  capabilities/          Tauri 2 ACL
  tauri.conf.json
scripts/                 icon + catalog generators
plugins/                 example plugin manifest
```

### Architecture notes

- CRUD runs in the frontend through a typed data layer (`src/lib/db.ts` plus
  per-domain repositories in `src/lib/repos/`) on top of `tauri-plugin-sql`.
- Multi-table writes (consume part + decrement stock + audit) go through the
  native `db_tx` command so they run atomically on one connection.
- The schema is created by versioned migrations (`src-tauri/src/db/migrations.rs`)
  on first launch. The reference catalog is generated by
  `scripts/seed-reference.mjs` into the seed SQL files; edit the curated arrays and
  re-run it to extend the catalog.
- Native Rust commands are limited to what the webview cannot do safely: `db_tx`,
  Square payment/refund/terminal calls, password hashing, attachment storage with
  hash-dedup, backup/restore ZIPs, and shell-open for boardview/PDF files.
- Conventions: money is integer cents, dates are ISO 8601 UTC, deletes are soft
  (`deleted_at`), foreign keys are on, and multi-table writes are transactional.

### Verifying a change

```bash
npm run typecheck                 # frontend types
npm run build                     # frontend build
cd src-tauri && cargo check       # Rust backend
```
