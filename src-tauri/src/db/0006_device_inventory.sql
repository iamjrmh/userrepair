-- Migration v6: serialized device fields for inventory items sold as devices.
ALTER TABLE inventory_items ADD COLUMN model_number TEXT;
ALTER TABLE inventory_items ADD COLUMN serial_number TEXT;
