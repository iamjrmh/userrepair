-- Migration v2: reference catalog table + FTS, and a device model_number column.

-- A searchable library of real parts/components, kept separate from shop stock
-- so it never affects inventory counts or value.
CREATE TABLE reference_parts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category        TEXT NOT NULL,            -- Mobile | Tablet | Laptop | Desktop | Console | TV | Consumable
  brand           TEXT,
  device_family   TEXT,
  device_models   TEXT,                     -- applicable model(s)
  part_type       TEXT NOT NULL,            -- Display | Battery | Charging IC | MOSFET | PMIC | ...
  name            TEXT NOT NULL,
  designator      TEXT,                     -- reference designator (U2, U6300, ...)
  manufacturer_pn TEXT,                     -- known manufacturer part number
  package         TEXT,                     -- QFN | BGA | WLCSP | ...
  description     TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

CREATE INDEX idx_reference_category ON reference_parts(category);
CREATE INDEX idx_reference_brand ON reference_parts(brand);
CREATE INDEX idx_reference_part_type ON reference_parts(part_type);

CREATE TRIGGER trg_reference_upd AFTER UPDATE ON reference_parts FOR EACH ROW
BEGIN
  UPDATE reference_parts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- Full-text search over the catalog.
CREATE VIRTUAL TABLE fts_reference USING fts5(
  name, device_models, part_type, designator, manufacturer_pn, brand, category, description,
  content='reference_parts', content_rowid='id'
);
CREATE TRIGGER fts_reference_ai AFTER INSERT ON reference_parts BEGIN
  INSERT INTO fts_reference(rowid, name, device_models, part_type, designator, manufacturer_pn, brand, category, description)
  VALUES (new.id, new.name, new.device_models, new.part_type, new.designator, new.manufacturer_pn, new.brand, new.category, new.description);
END;
CREATE TRIGGER fts_reference_ad AFTER DELETE ON reference_parts BEGIN
  INSERT INTO fts_reference(fts_reference, rowid, name, device_models, part_type, designator, manufacturer_pn, brand, category, description)
  VALUES ('delete', old.id, old.name, old.device_models, old.part_type, old.designator, old.manufacturer_pn, old.brand, old.category, old.description);
END;
CREATE TRIGGER fts_reference_au AFTER UPDATE ON reference_parts BEGIN
  INSERT INTO fts_reference(fts_reference, rowid, name, device_models, part_type, designator, manufacturer_pn, brand, category, description)
  VALUES ('delete', old.id, old.name, old.device_models, old.part_type, old.designator, old.manufacturer_pn, old.brand, old.category, old.description);
  INSERT INTO fts_reference(rowid, name, device_models, part_type, designator, manufacturer_pn, brand, category, description)
  VALUES (new.id, new.name, new.device_models, new.part_type, new.designator, new.manufacturer_pn, new.brand, new.category, new.description);
END;

-- Manufacturer model number on devices (e.g. A2342 / SM-G991B).
ALTER TABLE devices ADD COLUMN model_number TEXT;
