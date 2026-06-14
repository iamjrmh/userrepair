-- Migration v10: ensure every reference part has a brand and a Mfr Part #.
-- Real IC manufacturer part numbers are kept; manufacturers are inferred from
-- well-known part-number prefixes; parts without a published OEM number get a
-- deterministic catalog part number.

-- 1) Brand: infer manufacturer from known part-number prefixes, else a fallback.
UPDATE reference_parts SET brand = CASE
  WHEN manufacturer_pn LIKE 'BQ%' OR manufacturer_pn LIKE 'TPS%' OR manufacturer_pn LIKE 'MSP%'
       OR manufacturer_pn LIKE 'TM4C%' OR manufacturer_pn LIKE 'CC%' THEN 'Texas Instruments'
  WHEN manufacturer_pn LIKE 'ISL%' OR manufacturer_pn LIKE 'RL78%' OR manufacturer_pn LIKE 'RX2%'
       OR manufacturer_pn LIKE 'RA4%' THEN 'Renesas'
  WHEN manufacturer_pn LIKE 'IT8%' THEN 'ITE'
  WHEN manufacturer_pn LIKE 'KB%' THEN 'ENE'
  WHEN manufacturer_pn LIKE 'RT%' THEN 'Richtek'
  WHEN manufacturer_pn LIKE 'AON%' OR manufacturer_pn LIKE 'AO4%' THEN 'Alpha & Omega Semiconductor'
  WHEN manufacturer_pn LIKE 'NTMFS%' OR manufacturer_pn LIKE 'NCP%' OR manufacturer_pn LIKE 'NCT%' THEN 'onsemi'
  WHEN manufacturer_pn LIKE 'SI4%' THEN 'Vishay'
  WHEN manufacturer_pn LIKE 'W25Q%' THEN 'Winbond'
  WHEN manufacturer_pn LIKE 'uP%' THEN 'uPI Semiconductor'
  WHEN manufacturer_pn LIKE 'IR3%' THEN 'Infineon'
  WHEN manufacturer_pn LIKE 'MN86%' THEN 'Panasonic'
  WHEN manufacturer_pn LIKE '161%' OR manufacturer_pn LIKE '338S%' THEN 'Apple'
  WHEN category = 'Consumable' THEN 'Workshop'
  ELSE 'Generic'
END
WHERE brand IS NULL OR brand = '';

-- 2) Mfr Part #: keep real numbers; else use the reference designator; else a
--    readable common part code built from the device model and part type, e.g.
--    "IPHONE13-LCD", "GALAXYS21-BAT".
UPDATE reference_parts SET manufacturer_pn = (
  upper(replace(replace(replace(replace(replace(
    CASE
      WHEN instr(device_models, ',') > 0 THEN substr(device_models, 1, instr(device_models, ',') - 1)
      ELSE coalesce(device_models, brand, 'PART')
    END,
  ' ', ''), '(', ''), ')', ''), '/', ''), '-', ''))
  || '-' ||
  CASE part_type
    WHEN 'Display' THEN 'LCD'
    WHEN 'Battery' THEN 'BAT'
    WHEN 'Charging' THEN 'CHG'
    WHEN 'Camera' THEN 'CAM'
    WHEN 'Audio' THEN 'SPK'
    WHEN 'Haptics' THEN 'VIB'
    WHEN 'Flex' THEN 'FLX'
    WHEN 'Housing' THEN 'HSG'
    WHEN 'Small Parts' THEN 'SML'
    WHEN 'Keyboard' THEN 'KBD'
    WHEN 'Cooling' THEN 'FAN'
    WHEN 'Connectivity' THEN 'WIFI'
    WHEN 'Power' THEN 'PWR'
    WHEN 'IO' THEN 'IO'
    WHEN 'Connector' THEN 'CON'
    WHEN 'Storage' THEN 'SSD'
    WHEN 'Memory' THEN 'RAM'
    WHEN 'Clock' THEN 'RTC'
    WHEN 'Fuse' THEN 'FUSE'
    WHEN 'Thermal' THEN 'THM'
    WHEN 'BIOS' THEN 'BIOS'
    WHEN 'Power Board' THEN 'PSU'
    WHEN 'Main Board' THEN 'MB'
    WHEN 'T-CON' THEN 'TCON'
    WHEN 'Backlight' THEN 'BL'
    WHEN 'Panel' THEN 'PNL'
    WHEN 'Capacitor' THEN 'CAP'
    WHEN 'IR' THEN 'IR'
    WHEN 'Speaker' THEN 'SPK'
    WHEN 'Flux' THEN 'FLUX'
    WHEN 'Solder' THEN 'SLD'
    WHEN 'Desolder' THEN 'WICK'
    WHEN 'Clean' THEN 'CLN'
    WHEN 'Tape' THEN 'TAPE'
    WHEN 'Adhesive' THEN 'ADH'
    WHEN 'Tool' THEN 'TOOL'
    ELSE upper(substr(part_type, 1, 3))
  END
)
WHERE manufacturer_pn IS NULL OR manufacturer_pn = '';
