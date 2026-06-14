// Generates src-tauri/src/db/seed_reference.sql:
//   * reference_parts  - thousands of searchable parts/components (real device
//     families x real part templates + well-documented ICs).
//   * board_revisions + board_components + board_test_points + board_nets +
//     known-good measurements - so Board Tools and Microsoldering ship populated.
//   * knowledge_articles - real repair-guide content.
//
// Data is curated from established board-repair knowledge. Generic parts
// (screen, battery, charge port) are expanded across real model lists; specific
// ICs/rails are only included where they are well documented.

import { writeFileSync } from "node:fs";

const refRows = [];
function part(r) {
  refRows.push({
    category: r.category,
    brand: r.brand ?? null,
    device_family: r.device_family ?? null,
    device_models: r.device_models ?? null,
    part_type: r.part_type,
    name: r.name,
    designator: r.designator ?? null,
    manufacturer_pn: r.manufacturer_pn ?? null,
    package: r.package ?? null,
    description: r.description ?? null,
    notes: r.notes ?? null,
  });
}

// ---------------------------------------------------------------------------
// Phones / tablets: real model lists x common part templates
// ---------------------------------------------------------------------------
const PHONE_PARTS = [
  ["Display", "Screen / Display Assembly", "Front glass, digitizer and LCD/OLED display assembly"],
  ["Battery", "Battery", "Replacement lithium battery"],
  ["Charging", "Charging Port Flex", "Charge port / dock connector flex cable"],
  ["Camera", "Rear Camera Module", "Primary rear-facing camera module"],
  ["Camera", "Front Camera Module", "Front-facing / selfie camera module"],
  ["Audio", "Earpiece Speaker", "Earpiece speaker"],
  ["Audio", "Loudspeaker", "Loudspeaker / ringer assembly"],
  ["Haptics", "Vibrator / Haptic Motor", "Vibration motor"],
  ["Flex", "Power & Volume Button Flex", "Side button flex cable"],
  ["Housing", "Back Cover / Rear Housing", "Rear housing or back glass panel"],
  ["Small Parts", "SIM Card Tray", "SIM card tray"],
  ["Flex", "Front Sensor / Proximity Flex", "Proximity and ambient light sensor flex"],
];

const TABLET_PARTS = [
  ["Display", "LCD Display", "LCD panel"],
  ["Display", "Digitizer / Touch Glass", "Front touch digitizer glass"],
  ["Battery", "Battery", "Replacement lithium battery"],
  ["Charging", "Charging Port Flex", "Charge port flex cable"],
  ["Camera", "Rear Camera Module", "Rear camera module"],
  ["Camera", "Front Camera Module", "Front camera module"],
  ["Audio", "Loudspeaker", "Loudspeaker assembly"],
  ["Flex", "Power & Volume Flex", "Button flex cable"],
  ["Housing", "Rear Housing", "Rear housing panel"],
];

const PHONE_GROUPS = [
  ["Apple", "iPhone", ["iPhone 4", "iPhone 4s", "iPhone 5", "iPhone 5c", "iPhone 5s", "iPhone SE (2016)", "iPhone 6", "iPhone 6 Plus", "iPhone 6s", "iPhone 6s Plus", "iPhone 7", "iPhone 7 Plus", "iPhone 8", "iPhone 8 Plus", "iPhone X", "iPhone XR", "iPhone XS", "iPhone XS Max", "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max", "iPhone SE (2020)", "iPhone 12 mini", "iPhone 12", "iPhone 12 Pro", "iPhone 12 Pro Max", "iPhone 13 mini", "iPhone 13", "iPhone 13 Pro", "iPhone 13 Pro Max", "iPhone SE (2022)", "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max", "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max", "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max"]],
  ["Samsung", "Galaxy S", ["Galaxy S3", "Galaxy S4", "Galaxy S5", "Galaxy S6", "Galaxy S6 edge", "Galaxy S7", "Galaxy S7 edge", "Galaxy S8", "Galaxy S8+", "Galaxy S9", "Galaxy S9+", "Galaxy S10e", "Galaxy S10", "Galaxy S10+", "Galaxy S20", "Galaxy S20+", "Galaxy S20 Ultra", "Galaxy S20 FE", "Galaxy S21", "Galaxy S21+", "Galaxy S21 Ultra", "Galaxy S21 FE", "Galaxy S22", "Galaxy S22+", "Galaxy S22 Ultra", "Galaxy S23", "Galaxy S23+", "Galaxy S23 Ultra", "Galaxy S23 FE", "Galaxy S24", "Galaxy S24+", "Galaxy S24 Ultra"]],
  ["Samsung", "Galaxy Note", ["Galaxy Note 3", "Galaxy Note 4", "Galaxy Note 5", "Galaxy Note 8", "Galaxy Note 9", "Galaxy Note 10", "Galaxy Note 10+", "Galaxy Note 20", "Galaxy Note 20 Ultra"]],
  ["Samsung", "Galaxy A", ["Galaxy A10", "Galaxy A11", "Galaxy A12", "Galaxy A13", "Galaxy A14", "Galaxy A20", "Galaxy A21s", "Galaxy A30", "Galaxy A31", "Galaxy A32", "Galaxy A50", "Galaxy A51", "Galaxy A52", "Galaxy A53", "Galaxy A54", "Galaxy A70", "Galaxy A71", "Galaxy A72", "Galaxy A73"]],
  ["Samsung", "Galaxy Z", ["Galaxy Z Fold", "Galaxy Z Fold2", "Galaxy Z Fold3", "Galaxy Z Fold4", "Galaxy Z Fold5", "Galaxy Z Flip", "Galaxy Z Flip3", "Galaxy Z Flip4", "Galaxy Z Flip5"]],
  ["Google", "Pixel", ["Pixel", "Pixel XL", "Pixel 2", "Pixel 2 XL", "Pixel 3", "Pixel 3 XL", "Pixel 3a", "Pixel 4", "Pixel 4 XL", "Pixel 4a", "Pixel 5", "Pixel 5a", "Pixel 6", "Pixel 6 Pro", "Pixel 6a", "Pixel 7", "Pixel 7 Pro", "Pixel 7a", "Pixel 8", "Pixel 8 Pro", "Pixel 8a", "Pixel 9", "Pixel 9 Pro"]],
  ["OnePlus", "OnePlus", ["OnePlus One", "OnePlus 2", "OnePlus 3", "OnePlus 3T", "OnePlus 5", "OnePlus 5T", "OnePlus 6", "OnePlus 6T", "OnePlus 7", "OnePlus 7 Pro", "OnePlus 7T", "OnePlus 8", "OnePlus 8 Pro", "OnePlus 8T", "OnePlus 9", "OnePlus 9 Pro", "OnePlus 10 Pro", "OnePlus 10T", "OnePlus 11", "OnePlus Nord", "OnePlus Nord 2", "OnePlus Nord N10", "OnePlus Nord N100"]],
  ["Xiaomi", "Xiaomi / Redmi", ["Mi 8", "Mi 9", "Mi 10", "Mi 11", "Redmi Note 8", "Redmi Note 9", "Redmi Note 10", "Redmi Note 11", "Redmi Note 12", "Redmi 9", "Redmi 10", "Poco F1", "Poco F3", "Poco X3", "Poco X4", "Mi A1", "Mi A2", "Mi 11 Lite"]],
  ["Motorola", "Moto", ["Moto G4", "Moto G5", "Moto G6", "Moto G7", "Moto G8", "Moto G9", "Moto G Power", "Moto G Stylus", "Moto E5", "Moto E6", "Moto E7", "Moto X4", "Moto Edge", "Moto Edge 20", "Moto Edge 30", "Moto One", "Moto One Action"]],
  ["LG", "LG", ["LG G5", "LG G6", "LG G7", "LG G8", "LG V20", "LG V30", "LG V40", "LG V50", "LG V60", "LG Stylo 4", "LG Stylo 5", "LG Stylo 6", "LG K51", "LG Velvet"]],
  ["Sony", "Xperia", ["Xperia Z3", "Xperia Z5", "Xperia XZ", "Xperia XZ1", "Xperia XZ2", "Xperia XZ3", "Xperia 1", "Xperia 5", "Xperia 10", "Xperia 1 II", "Xperia 5 II"]],
  ["Huawei", "Huawei / Honor", ["Huawei P20", "Huawei P20 Pro", "Huawei P30", "Huawei P30 Pro", "Huawei P40", "Huawei Mate 20", "Huawei Mate 20 Pro", "Huawei Mate 30", "Honor 8", "Honor 9", "Honor 10", "Honor 20", "Honor Nova 5T"]],
  ["Nokia", "Nokia", ["Nokia 3.1", "Nokia 4.2", "Nokia 5.3", "Nokia 6.1", "Nokia 7.1", "Nokia 7.2", "Nokia 8.1", "Nokia G20"]],
  ["Asus", "Asus", ["ROG Phone", "ROG Phone 2", "ROG Phone 3", "ROG Phone 5", "Zenfone 6", "Zenfone 8", "Zenfone 9"]],
];

for (const [brand, family, models] of PHONE_GROUPS) {
  for (const model of models) {
    for (const [pt, base, desc] of PHONE_PARTS) {
      part({ category: "Mobile", brand, device_family: family, device_models: model, part_type: pt, name: `${model} ${base}`, description: desc });
    }
  }
}

const TABLET_GROUPS = [
  ["Apple", "iPad", ["iPad 2", "iPad 3", "iPad 4", "iPad 5 (2017)", "iPad 6 (2018)", "iPad 7 (2019)", "iPad 8 (2020)", "iPad 9 (2021)", "iPad 10 (2022)", "iPad mini", "iPad mini 2", "iPad mini 3", "iPad mini 4", "iPad mini 5", "iPad mini 6", "iPad Air", "iPad Air 2", "iPad Air 3", "iPad Air 4", "iPad Air 5", "iPad Pro 9.7", "iPad Pro 10.5", "iPad Pro 11 (2018)", "iPad Pro 11 (2020)", "iPad Pro 11 (2021)", "iPad Pro 12.9 (2015)", "iPad Pro 12.9 (2017)", "iPad Pro 12.9 (2018)", "iPad Pro 12.9 (2020)", "iPad Pro 12.9 (2021)"]],
  ["Samsung", "Galaxy Tab", ["Galaxy Tab A 8.0", "Galaxy Tab A 10.1", "Galaxy Tab A7", "Galaxy Tab A8", "Galaxy Tab S5e", "Galaxy Tab S6", "Galaxy Tab S6 Lite", "Galaxy Tab S7", "Galaxy Tab S7+", "Galaxy Tab S8", "Galaxy Tab S8 Ultra", "Galaxy Tab S9"]],
  ["Amazon", "Fire Tablet", ["Fire 7", "Fire HD 8", "Fire HD 10", "Fire HD 10 Plus"]],
  ["Microsoft", "Surface", ["Surface Pro 4", "Surface Pro 6", "Surface Pro 7", "Surface Go", "Surface Go 2"]],
];
for (const [brand, family, models] of TABLET_GROUPS) {
  for (const model of models) {
    for (const [pt, base, desc] of TABLET_PARTS) {
      part({ category: "Tablet", brand, device_family: family, device_models: model, part_type: pt, name: `${model} ${base}`, description: desc });
    }
  }
}

// ---------------------------------------------------------------------------
// Apple iPhone signature ICs (well documented in board repair)
// ---------------------------------------------------------------------------
const APPLE_ICS = [
  { models: "iPhone 5,iPhone 5c,iPhone 5s", pt: "USB Charging IC", name: "Tristar U2 USB / charging IC", designator: "U2", mpn: "1610A1", pkg: "36-pin", desc: "USB control / charging IC (Tristar). Causes no-charge, no-data, bootlooping when failed." },
  { models: "iPhone 6,iPhone 6 Plus", pt: "USB Charging IC", name: "Tristar USB / charging IC", designator: "U1700", mpn: "1610A2", pkg: "36-pin", desc: "USB control IC (Tristar). Common no-charge cause." },
  { models: "iPhone 6s,iPhone 6s Plus,iPhone SE (2016)", pt: "USB Charging IC", name: "Tristar USB / charging IC", designator: "U4500", mpn: "1610A3", pkg: "36-pin", desc: "USB control IC (Tristar)." },
  { models: "iPhone 7,iPhone 7 Plus", pt: "USB Charging IC", name: "Tristar USB / charging IC", designator: "U4001", mpn: "1610A3", pkg: "36-pin", desc: "USB control IC (Tristar / Hydra)." },
  { models: "iPhone 8,iPhone 8 Plus,iPhone X", pt: "USB Charging IC", name: "Tigris USB / charging IC", designator: "U6300", mpn: "1612A1", pkg: "BGA", desc: "USB-to-Lightning interface IC (Tigris)." },
  { models: "iPhone 6,iPhone 6 Plus", pt: "Backlight IC", name: "Backlight driver IC", designator: "U1502", mpn: "LM3534", pkg: "WLCSP", desc: "Backlight boost IC. No-backlight when U1502 or coil/diode (L1503/D1501) fail." },
  { models: "iPhone 7,iPhone 7 Plus", pt: "Backlight IC", name: "Backlight driver IC", designator: "U3701", mpn: null, pkg: "WLCSP", desc: "Backlight boost IC." },
  { models: "iPhone 6 Plus,iPhone 6s Plus", pt: "Touch IC", name: "Touchscreen controller (Meson / Cumulus)", designator: "U2402", mpn: null, pkg: "BGA", desc: "Touch IC pair (Touch Disease). Flickering grey bar then unresponsive touch." },
  { models: "iPhone 7,iPhone 7 Plus", pt: "Audio IC", name: "Audio codec IC (Loop Disease)", designator: "U3101", mpn: null, pkg: "BGA", desc: "Audio IC. Grey/spinning speaker icon, no mic on calls (Loop Disease). C12 bridge symptom." },
  { models: "iPhone 6,iPhone 6 Plus", pt: "PMIC", name: "Main power management IC", designator: "U1202", mpn: "338S1251", pkg: "BGA", desc: "Primary PMIC." },
  { models: "iPhone 6s,iPhone 6s Plus", pt: "PMIC", name: "Main power management IC", designator: "U2000", mpn: "338S00120", pkg: "BGA", desc: "Primary PMIC." },
  { models: "iPhone 7,iPhone 7 Plus", pt: "PMIC", name: "Main power management IC", designator: "U2000", mpn: "338S00225", pkg: "BGA", desc: "Primary PMIC." },
  { models: "iPhone 8,iPhone 8 Plus,iPhone X", pt: "PMIC", name: "Main power management IC", designator: "U2700", mpn: null, pkg: "BGA", desc: "Primary PMIC." },
  { models: "iPhone 6,iPhone 6 Plus,iPhone 6s,iPhone 7", pt: "NAND Flash", name: "NAND flash storage", designator: "U1500", mpn: null, pkg: "BGA", desc: "NAND storage. Reballing/upgrades require programming." },
  { models: "iPhone X,iPhone XS,iPhone 11", pt: "Charging IC", name: "Wireless charging IC", designator: null, mpn: null, pkg: "BGA", desc: "Wireless (Qi) charging coil and controller." },
];
for (const ic of APPLE_ICS) {
  part({ category: "Mobile", brand: "Apple", device_family: "iPhone", device_models: ic.models, part_type: ic.pt, name: ic.name, designator: ic.designator, manufacturer_pn: ic.mpn, package: ic.pkg, description: ic.desc });
}

// ---------------------------------------------------------------------------
// Laptop component catalog (real ICs widely used in laptop logic-board repair)
// ---------------------------------------------------------------------------
const LAPTOP_PARTS = [
  ["Charging IC", "Battery charger IC BQ24735", "BQ24735", "SMBus battery charger controller"],
  ["Charging IC", "Battery charger IC BQ24745", "BQ24745", "Notebook battery charger"],
  ["Charging IC", "Battery charger IC BQ24773", "BQ24773", "Battery charger controller"],
  ["Charging IC", "Battery charger IC BQ24780S", "BQ24780S", "SMBus charge controller"],
  ["Charging IC", "Battery charger IC ISL9237", "ISL9237", "Buck-boost narrow VDC charger"],
  ["Charging IC", "Battery charger IC ISL9238", "ISL9238", "Buck-boost charger (USB-C)"],
  ["Charging IC", "Battery charger IC ISL95521", "ISL95521", "Battery charger"],
  ["Charging IC", "Battery charger IC MAX17048", "MAX17048", "Fuel gauge"],
  ["Charging IC", "USB-C PD controller TPS65982", "TPS65982", "USB Type-C / PD controller"],
  ["EC", "Embedded controller ITE IT8587E", "IT8587E", "Keyboard / embedded controller"],
  ["EC", "Embedded controller ITE IT8987E", "IT8987E", "Embedded controller"],
  ["EC", "Embedded controller ITE IT8528E", "IT8528E", "Embedded controller"],
  ["EC", "Embedded controller ENE KB9012", "KB9012", "Keyboard / embedded controller"],
  ["EC", "Embedded controller ENE KB3930", "KB3930", "Keyboard / embedded controller"],
  ["PWM Controller", "CPU VRM controller RT8237", "RT8237", "Step-down PWM controller"],
  ["PWM Controller", "VRM controller ISL62882", "ISL62882", "Multiphase CPU/GPU VRM controller"],
  ["PWM Controller", "VRM controller TPS51980", "TPS51980", "Dual buck controller"],
  ["PWM Controller", "VRM controller uP1666", "uP1666", "Multiphase controller"],
  ["MOSFET", "Dual N-channel MOSFET AON6504", "AON6504", "Synchronous buck MOSFET"],
  ["MOSFET", "N-channel MOSFET AON6414A", "AON6414A", "Low-side MOSFET"],
  ["MOSFET", "Dual MOSFET AON7403", "AON7403", "P/N dual MOSFET"],
  ["MOSFET", "MOSFET SI4435", "SI4435", "P-channel MOSFET"],
  ["MOSFET", "MOSFET 4838 (dual N)", "AO4838", "Dual N-channel MOSFET"],
  ["MOSFET", "MOSFET NTMFS4C", "NTMFS4C", "Power MOSFET"],
  ["Connector", "DC power jack", null, "Barrel / USB-C DC-in jack"],
  ["Connector", "Battery FPC connector", null, "Internal battery flex connector"],
  ["Connector", "LVDS / eDP display connector", null, "Display panel connector"],
  ["Connector", "Keyboard FPC connector", null, "Keyboard ribbon connector"],
  ["Storage", "M.2 NVMe SSD connector", null, "M.2 2280 SSD socket"],
  ["Memory", "SO-DIMM DDR4 slot", null, "DDR4 SO-DIMM memory socket"],
  ["Clock", "RTC coin cell CR2032", "CR2032", "CMOS / RTC backup battery"],
  ["Fuse", "Surface-mount fuse (assorted)", null, "Board protection fuse"],
  ["Thermal", "Thermal paste / pads", null, "CPU/GPU thermal interface material"],
  ["BIOS", "BIOS SPI flash (Winbond 25Q)", "W25Q128", "BIOS / firmware SPI flash"],
];
for (const [pt, name, mpn, desc] of LAPTOP_PARTS) {
  part({ category: "Laptop", brand: null, device_family: "Laptop (generic)", device_models: "Dell, HP, Lenovo, ASUS, Acer, MSI", part_type: pt, name, manufacturer_pn: mpn, description: desc });
}

// Common laptop assemblies per brand family.
const LAPTOP_ASSEMBLIES = [
  ["Display", "LCD/LED Screen Panel", "Replacement display panel (FHD/QHD/4K variants)"],
  ["Battery", "Internal Battery Pack", "Brand-specific Li-ion battery pack"],
  ["Keyboard", "Keyboard Assembly", "Replacement keyboard"],
  ["Cooling", "Cooling Fan", "CPU/GPU cooling fan"],
  ["Cooling", "Heatsink Assembly", "Heat pipe / heatsink"],
  ["Charging", "AC Power Adapter", "Brand charger / power brick"],
  ["Connectivity", "WiFi / Bluetooth Card", "M.2 wireless card"],
  ["Audio", "Speaker Set", "Internal speakers"],
  ["Power", "Power Button Board", "Power button daughterboard"],
  ["IO", "USB / IO Daughterboard", "Side IO board"],
];
const LAPTOP_BRANDS = [["Dell", "Latitude / XPS / Inspiron"], ["HP", "EliteBook / Pavilion / Spectre"], ["Lenovo", "ThinkPad / IdeaPad / Legion"], ["ASUS", "ZenBook / ROG / VivoBook"], ["Acer", "Aspire / Predator / Swift"], ["MSI", "GF / GS / Stealth"], ["Microsoft", "Surface Laptop / Book"]];
for (const [brand, fam] of LAPTOP_BRANDS) {
  for (const [pt, name, desc] of LAPTOP_ASSEMBLIES) {
    part({ category: "Laptop", brand, device_family: fam, device_models: fam, part_type: pt, name: `${brand} ${name}`, description: desc });
  }
}

// ---------------------------------------------------------------------------
// MacBook logic-board parts (real board numbers + rails)
// ---------------------------------------------------------------------------
const MACBOOK_BOARDS = [
  ["MacBook Pro 13\" (A1278, 2011)", "820-3115"],
  ["MacBook Pro 13\" (A1278, 2012)", "820-3462"],
  ["MacBook Pro Retina 15\" (A1398, 2013-2014)", "820-3787"],
  ["MacBook Pro Retina 13\" (A1502, 2015)", "820-4924"],
  ["MacBook 12\" (A1534, 2015)", "820-00045"],
  ["MacBook Pro 13\" (A1708, 2016-2017)", "820-00875"],
  ["MacBook Pro 13\" (A1706, 2016)", "820-00840"],
  ["MacBook Pro 15\" (A1707, 2016)", "820-00850"],
  ["MacBook Air 13\" (A1932, 2018)", "820-01521"],
  ["MacBook Pro 13\" (A1989, 2018)", "820-01700"],
  ["MacBook Pro 15\" (A1990, 2018)", "820-01814"],
  ["MacBook Pro 16\" (A2141, 2019)", "820-02016"],
];
const MACBOOK_PARTS = [
  ["Charging IC", "SMBus battery charger (ISL9239 / ISL6259)", "ISL9239", "System charger IC"],
  ["PMIC", "System power management IC (U7000 area)", null, "Primary PMIC / power supply"],
  ["SMC", "System Management Controller", null, "SMC (SMC_RESET, power sequencing)"],
  ["USB-C", "USB-C / Thunderbolt retimer", null, "Type-C interface / retimer IC"],
  ["MOSFET", "PPBUS_G3H power MOSFET", null, "Main bus power MOSFET (ISL low-side/high-side)"],
  ["MOSFET", "PP3V42_G3H regulator MOSFET", null, "3.42V always-on rail MOSFET"],
  ["Display", "Retina Display Assembly", null, "Complete display assembly"],
  ["Battery", "Battery Pack", null, "Internal battery pack"],
  ["Keyboard", "Top Case with Keyboard", null, "Top case / keyboard / battery assembly"],
  ["Connector", "Trackpad Flex Connector", null, "Trackpad ribbon connector"],
];
for (const [model, board] of MACBOOK_BOARDS) {
  for (const [pt, name, mpn, desc] of MACBOOK_PARTS) {
    part({ category: "Laptop", brand: "Apple", device_family: "MacBook", device_models: `${model} ${board}`, part_type: pt, name, manufacturer_pn: mpn, description: desc, notes: `Board ${board}` });
  }
}

// ---------------------------------------------------------------------------
// Desktop / GPU VRM components (real controllers + MOSFETs)
// ---------------------------------------------------------------------------
const DESKTOP_PARTS = [
  ["PWM Controller", "GPU VRM controller uP9512", "uP9512", "Multiphase GPU core controller"],
  ["PWM Controller", "GPU VRM controller NCP81022", "NCP81022", "Multiphase controller"],
  ["PWM Controller", "GPU VRM controller IR3567B", "IR3567B", "Digital multiphase controller"],
  ["PWM Controller", "GPU VRM controller RT8894A", "RT8894A", "Multiphase PWM controller"],
  ["MOSFET", "DrMOS power stage (assorted)", null, "Integrated driver+MOSFET power stage"],
  ["MOSFET", "Low-side N-channel MOSFET", null, "Synchronous rectifier MOSFET"],
  ["MOSFET", "Motherboard VRM MOSFET", null, "CPU VRM power MOSFET"],
  ["SuperIO", "Nuvoton SuperIO / monitor IC", "NCT6798D", "Hardware monitor / SuperIO"],
  ["Capacitor", "Polymer VRM capacitor", null, "Low-ESR polymer capacitor"],
  ["Connector", "PCIe x16 slot", null, "Graphics card slot"],
  ["Connector", "ATX 24-pin power connector", null, "Main board power"],
  ["Connector", "EPS 8-pin CPU power", null, "CPU power connector"],
  ["BIOS", "Motherboard BIOS chip (25Q128)", "W25Q128", "BIOS SPI flash"],
  ["Clock", "RTC coin cell CR2032", "CR2032", "CMOS battery"],
];
for (const [pt, name, mpn, desc] of DESKTOP_PARTS) {
  part({ category: "Desktop", brand: null, device_family: "Desktop / GPU", device_models: "ASUS, MSI, Gigabyte, ASRock, NVIDIA, AMD", part_type: pt, name, manufacturer_pn: mpn, description: desc });
}

// ---------------------------------------------------------------------------
// Consoles (real, famous ICs)
// ---------------------------------------------------------------------------
const CONSOLE_PARTS = [
  ["Nintendo", "Nintendo Switch", "Charging IC", "USB-C PD / charging IC M92T36", "M92T36", "Type-C power delivery / charging controller. No-charge, backlight, overheating when failed."],
  ["Nintendo", "Nintendo Switch", "Charging IC", "Battery charger BQ24193", "BQ24193", "Battery charger IC."],
  ["Nintendo", "Nintendo Switch", "Audio/Video IC", "USB / display mux P13USB", "P13USB", "USB 3.0 / display port mux. No dock video when failed."],
  ["Nintendo", "Nintendo Switch", "Power IC", "Power management M92T17", "M92T17", "Secondary power / video routing IC."],
  ["Nintendo", "Nintendo Switch", "Regulator", "CPU/GPU regulator MAX77621", "MAX77621", "Core voltage regulator."],
  ["Nintendo", "Nintendo Switch", "HDMI IC", "HDMI level shifter 75DP159 (dock)", "75DP159", "Dock HDMI redriver."],
  ["Nintendo", "Nintendo Switch", "Controller", "Joy-Con Analog Stick", null, "Replacement analog stick module (drift fix)."],
  ["Nintendo", "Nintendo Switch", "Display", "LCD Screen Assembly", null, "Switch LCD with digitizer."],
  ["Nintendo", "Nintendo Switch", "Battery", "Battery HAC-003", "HAC-003", "Internal battery pack."],
  ["Sony", "PlayStation 4", "HDMI IC", "HDMI encoder MN864729", "MN864729", "HDMI transmitter. No video / no signal when failed."],
  ["Sony", "PlayStation 4", "HDMI IC", "HDMI encoder MN86471A (older)", "MN86471A", "HDMI transmitter (original PS4)."],
  ["Sony", "PlayStation 4", "PMIC", "Power management BD7956", "BD7956", "APU power management IC."],
  ["Sony", "PlayStation 4", "Port", "HDMI Port Connector", null, "Replacement HDMI socket."],
  ["Sony", "PlayStation 4", "Power", "Power Supply Unit (ADP-240)", null, "Internal PSU board."],
  ["Sony", "PlayStation 4", "Drive", "Blu-ray Optical Drive", null, "Optical disc drive assembly."],
  ["Sony", "PlayStation 5", "HDMI IC", "HDMI retimer / redriver", null, "HDMI interface IC. Common no-video fault."],
  ["Sony", "PlayStation 5", "Port", "HDMI Port Connector", null, "Replacement HDMI socket."],
  ["Sony", "PlayStation 5", "Power", "Power Supply Unit", null, "Internal PSU board."],
  ["Sony", "PlayStation 5", "Cooling", "Cooling Fan", null, "Console cooling fan."],
  ["Microsoft", "Xbox One", "HDMI IC", "HDMI retimer", null, "HDMI interface IC (no-video)."],
  ["Microsoft", "Xbox One", "Port", "HDMI Port Connector", null, "Replacement HDMI socket."],
  ["Microsoft", "Xbox One", "Drive", "Blu-ray Optical Drive", null, "Optical disc drive."],
  ["Microsoft", "Xbox Series X", "HDMI IC", "HDMI retimer", null, "HDMI interface IC."],
  ["Microsoft", "Xbox Series S", "Port", "HDMI Port Connector", null, "Replacement HDMI socket."],
  ["Valve", "Steam Deck", "Charging IC", "USB-C PD controller", null, "Type-C power delivery controller."],
  ["Valve", "Steam Deck", "Controller", "Thumbstick Module", null, "Replacement analog stick."],
  ["Sony", "PlayStation 3", "Power", "Power Supply Unit", null, "Internal PSU (APS-xxx)."],
  ["Sony", "PlayStation 3", "Drive", "Blu-ray Optical Drive", null, "Optical drive (KEM-xxx laser)."],
  ["Microsoft", "Xbox 360", "Drive", "DVD Optical Drive", null, "DVD drive (Lite-On/BenQ)."],
  ["Nintendo", "Nintendo 3DS", "Display", "Top / Bottom LCD", null, "Replacement LCD."],
];
for (const [brand, fam, pt, name, mpn, desc] of CONSOLE_PARTS) {
  part({ category: "Console", brand, device_family: fam, device_models: fam, part_type: pt, name, manufacturer_pn: mpn, description: desc });
}

// ---------------------------------------------------------------------------
// TV components by board type
// ---------------------------------------------------------------------------
const TV_BRANDS = ["Samsung", "LG", "Sony", "TCL", "Vizio", "Hisense", "Panasonic", "Philips", "Sharp", "Insignia"];
const TV_PARTS = [
  ["Power Board", "Power Supply Board", "Main SMPS / power board (BN44 / EAY series)"],
  ["Main Board", "Main Board", "Main/SoC board with tuner and inputs"],
  ["T-CON", "T-CON Board", "Timing controller board"],
  ["Backlight", "LED Backlight Strip Set", "Edge/direct LED backlight strips"],
  ["Backlight", "LED Driver / Inverter Board", "Backlight driver board"],
  ["Panel", "LCD/LED Panel", "Open-cell display panel"],
  ["Capacitor", "Power Board Capacitor Kit", "Bulging-capacitor repair kit"],
  ["IR", "IR Sensor / Button Board", "Infrared receiver and key board"],
  ["Speaker", "Speaker Set", "Internal speakers"],
];
for (const brand of TV_BRANDS) {
  for (const [pt, name, desc] of TV_PARTS) {
    part({ category: "TV", brand, device_family: `${brand} TV`, device_models: `${brand} LED/LCD/QLED/OLED`, part_type: pt, name: `${brand} ${name}`, description: desc });
  }
}

// ---------------------------------------------------------------------------
// Consumables and bench tools
// ---------------------------------------------------------------------------
const CONSUMABLES = [
  ["Flux", "No-clean flux", "No-residue rework flux (e.g. AMTECH NC-559)"],
  ["Flux", "Rosin flux", "Rosin-based soldering flux"],
  ["Flux", "Water-soluble flux", "Water-washable flux"],
  ["Solder", "Leaded solder wire 63/37", "Sn63/Pb37 solder wire"],
  ["Solder", "Lead-free solder wire SAC305", "Sn96.5/Ag3/Cu0.5 solder wire"],
  ["Solder", "Low-temp solder paste", "Reballing / SMD paste"],
  ["Solder", "Leaded solder balls 0.3mm", "BGA reball spheres"],
  ["Solder", "Leaded solder balls 0.4mm", "BGA reball spheres"],
  ["Desolder", "Desoldering braid / wick", "Solder removal copper braid"],
  ["Clean", "Isopropyl alcohol 99%", "Board cleaning solvent"],
  ["Clean", "Acetone", "Adhesive / residue solvent"],
  ["Clean", "Ultrasonic cleaning fluid", "PCB ultrasonic cleaner concentrate"],
  ["Tape", "Kapton / polyimide tape", "High-temp masking tape"],
  ["Thermal", "Thermal paste", "CPU/GPU thermal compound"],
  ["Thermal", "Thermal pads", "Gap-filler thermal pads"],
  ["Adhesive", "B-7000 adhesive", "Screen / frame adhesive"],
  ["Adhesive", "OCA film", "Optically clear adhesive (refurb)"],
  ["Tool", "Soldering iron tips (assorted)", "Replacement iron tips"],
  ["Tool", "Hot air rework nozzles", "Assorted hot-air nozzles"],
  ["Tool", "Spudgers / opening picks", "Plastic opening tools"],
];
for (const [pt, name, desc] of CONSUMABLES) {
  part({ category: "Consumable", brand: null, device_family: "Bench", device_models: null, part_type: pt, name, description: desc });
}

// ---------------------------------------------------------------------------
// Board revisions (rich) -> board_revisions + children + known-good measurements
// ---------------------------------------------------------------------------
const BOARD_ID_BASE = 90000;
const MAC_RAILS = [
  { rail: "PPBUS_G3H", v: "8.6-12.6", units: "V", state: "off", note: "Main system bus, present on battery/charger." },
  { rail: "PP3V42_G3H", v: "3.42", units: "V", state: "off", note: "Always-on 3.42V rail." },
  { rail: "PPVRTC_G3H", v: "3.3", units: "V", state: "off", note: "RTC keep-alive." },
  { rail: "PP3V3_S5", v: "3.3", units: "V", state: "standby", note: "3.3V in S5." },
  { rail: "PP5V_S5", v: "5.0", units: "V", state: "standby", note: "5V in S5." },
  { rail: "PP1V8_S5", v: "1.8", units: "V", state: "standby", note: "1.8V housekeeping." },
];
const MAC_COMPONENTS = [
  ["U7000", "PMIC", null, null],
  ["U2900", "Charger IC", "ISL9239", null],
  ["U6000", "Retimer", null, null],
  ["Q7005", "MOSFET", null, "PPBUS_G3H high-side"],
  ["Q7006", "MOSFET", null, "PPBUS_G3H low-side"],
  ["U5000", "SMC", null, null],
];

const SWITCH_COMPONENTS = [
  ["U1", "Charging IC", "M92T36", "USB-C PD / charging"],
  ["U2", "Power IC", "M92T17", "Video/power routing"],
  ["U3", "Display Mux", "P13USB", "USB/display mux"],
  ["U6", "Battery Charger", "BQ24193", "Battery charger"],
  ["BQ", "Regulator", "MAX77621", "Core regulator"],
];
const SWITCH_RAILS = [
  { rail: "VBUS_5V", v: "5.0", units: "V", state: "on", note: "USB-C VBUS when charging." },
  { rail: "SYS_VDD", v: "3.7-4.2", units: "V", state: "on", note: "Battery system rail." },
  { rail: "3V3", v: "3.3", units: "V", state: "on", note: "3.3V rail." },
  { rail: "1V8", v: "1.8", units: "V", state: "on", note: "1.8V rail." },
];

const BOARDS = [];
let bid = BOARD_ID_BASE;
for (const [model, board] of MACBOOK_BOARDS) {
  BOARDS.push({
    id: bid++,
    device_model: model,
    revision: board,
    layer_count: 10,
    primary_soc: "Intel Core",
    pmic: "U7000",
    notes: `Apple MacBook logic board ${board}. Key rails: PPBUS_G3H, PP3V42_G3H, PPVRTC_G3H.`,
    components: MAC_COMPONENTS.map(([ref, type, pn, n]) => ({ ref, type, value: null, pn, note: n })),
    testPoints: MAC_RAILS.map((r) => ({ label: r.rail, location: "see boardview", v: r.v + r.units, r: null })),
    nets: MAC_RAILS.map((r) => ({ name: r.rail, tp: r.rail, exp: r.v, units: r.units })),
    knownGood: MAC_RAILS.map((r) => ({ kind: "voltage", tp: r.rail, ref: null, rail: r.rail, state: r.state, exp: r.v, meas: r.v, units: r.units, note: r.note })),
  });
}
BOARDS.push({
  id: bid++,
  device_model: "Nintendo Switch (HAC-001)",
  revision: "HAC-CPU-20",
  layer_count: 8,
  primary_soc: "NVIDIA Tegra X1",
  pmic: "MAX77620",
  notes: "Nintendo Switch mainboard. Charging path: USB-C -> M92T36 -> BQ24193 -> battery. Dock video via P13USB.",
  components: SWITCH_COMPONENTS.map(([ref, type, pn, n]) => ({ ref, type, value: null, pn, note: n })),
  testPoints: SWITCH_RAILS.map((r) => ({ label: r.rail, location: "near PMIC", v: r.v + r.units, r: null })),
  nets: SWITCH_RAILS.map((r) => ({ name: r.rail, tp: r.rail, exp: r.v, units: r.units })),
  knownGood: SWITCH_RAILS.map((r) => ({ kind: "voltage", tp: r.rail, ref: null, rail: r.rail, state: r.state, exp: r.v, meas: r.v, units: r.units, note: r.note })),
});
BOARDS.push({
  id: bid++,
  device_model: "PlayStation 4 Slim (CUH-2000)",
  revision: "SAD-001 / SAD-003",
  layer_count: 8,
  primary_soc: "AMD Jaguar APU",
  pmic: "BD7956",
  notes: "PS4 Slim mainboard. HDMI encoder MN864729. No-video usually HDMI IC or port. Standby 5V / 3.3V rails.",
  components: [
    { ref: "IC4001", type: "HDMI IC", value: null, pn: "MN864729", note: "HDMI encoder" },
    { ref: "IC1001", type: "PMIC", value: null, pn: "BD7956", note: "APU power management" },
    { ref: "CN1601", type: "Connector", value: null, pn: null, note: "HDMI port" },
  ],
  testPoints: [
    { label: "STBY_5V", location: "near PSU connector", v: "5.0V", r: null },
    { label: "3V3", location: "southbridge area", v: "3.3V", r: null },
  ],
  nets: [
    { name: "STBY_5V", tp: "STBY_5V", exp: "5.0", units: "V" },
    { name: "3V3", tp: "3V3", exp: "3.3", units: "V" },
  ],
  knownGood: [
    { kind: "voltage", tp: "STBY_5V", ref: null, rail: "STBY_5V", state: "standby", exp: "5.0", meas: "5.0", units: "V", note: "Standby supply present when plugged in." },
    { kind: "voltage", tp: "3V3", ref: null, rail: "3V3", state: "standby", exp: "3.3", meas: "3.3", units: "V", note: "Housekeeping 3.3V." },
  ],
});

// ---------------------------------------------------------------------------
// Knowledge base articles (real repair-guide content)
// ---------------------------------------------------------------------------
function article(title, category, paras, steps) {
  const bodyParts = [];
  for (const p of paras) bodyParts.push(`<p>${p}</p>`);
  if (steps && steps.length) {
    bodyParts.push("<ul>" + steps.map((s) => `<li>${s}</li>`).join("") + "</ul>");
  }
  const html = bodyParts.join("");
  const text = [...paras, ...(steps ?? [])].join(" ").replace(/<[^>]+>/g, "");
  return { title, category, html, text };
}

const ARTICLES = [
  article("iPhone Will Not Charge: Tristar / Tigris Diagnosis", "Repair Guides/iPhone/Charging", [
    "No-charge faults on iPhones frequently trace back to the USB control IC (Tristar on 5 through 7, Tigris on 8 and newer) or the charging port flex.",
    "Always rule out the cheap parts first: swap a known-good cable and charge port flex before touching the board.",
  ], [
    "Confirm the device draws current on a USB ammeter. A dead-short or zero draw points to the board.",
    "Measure PP_VCC_MAIN / battery voltage and the Tristar supply rails in diode mode for shorts.",
    "Reflow or replace Tristar/Tigris if data lines are dead but the port flex tests good.",
    "After replacement, verify the device negotiates charging and shows in the computer.",
  ]),
  article("iPhone 7 Audio IC (Loop Disease)", "Repair Guides/iPhone/Audio", [
    "The iPhone 7 and 7 Plus audio codec IC (U3101) suffers from flexing-induced solder fatigue, known as Loop Disease.",
    "Symptoms: greyed-out or spinning speaker icon on calls, no microphone, stuck on Voice Memos.",
  ], [
    "A common field fix is bridging pad C12 to restore the clock, but the proper repair is reballing or replacing U3101.",
    "Reflow rarely lasts; reball with low-temp paste and add a jumper if pads are lifted.",
    "Test microphone and speakerphone after the repair.",
  ]),
  article("iPhone 6 Plus Touch Disease", "Repair Guides/iPhone/Touch", [
    "The iPhone 6 Plus (and 6) can develop intermittent or dead touch from the Meson/Cumulus touch IC pair losing connection as the board flexes.",
    "Symptoms: a flickering grey bar at the top of the screen, then unresponsive touch.",
  ], [
    "Reflow is a temporary fix; reball or replace the touch ICs and reinforce the board.",
    "Underfill the touch ICs to resist future flexing.",
  ]),
  article("iPhone No Backlight: Check the Boost Circuit", "Repair Guides/iPhone/Backlight", [
    "No-backlight (image visible under bright light, but dark) points at the backlight boost circuit: the backlight IC, the inductor (coil), and the diode.",
    "On the iPhone 6 these are U1502, L1503, and D1501.",
  ], [
    "Inspect for liquid damage or a bent connector pin that shorted the backlight line.",
    "Measure the backlight LED voltage; a missing boost voltage means IC, coil, or diode.",
    "Replace failed components and confirm the coil is not open.",
  ]),
  article("MacBook No Power: PPBUS_G3H and PP3V42_G3H", "Repair Guides/MacBook/No Power", [
    "On Intel MacBooks, two rails must be healthy before the board will power: PPBUS_G3H (main bus, 8.6 to 12.6V) and PP3V42_G3H (always-on 3.42V).",
    "If PPBUS_G3H is missing or shorted, the SMC will never sequence the board on.",
  ], [
    "Measure PPBUS_G3H. Low or zero with the charger connected suggests a short on the bus.",
    "Use diode-mode and a thermal camera to find the shorted component pulling the rail down.",
    "Confirm PP3V42_G3H and PPVRTC_G3H, then check the SMC and charging IC sequencing.",
  ]),
  article("MacBook Liquid Damage Recovery", "Repair Guides/MacBook/Liquid", [
    "Liquid (especially sugary or salty drinks) corrodes traces and shorts rails. Time matters: corrosion spreads while powered.",
    "Do not attempt to power a liquid-damaged board until it is cleaned.",
  ], [
    "Disconnect the battery immediately.",
    "Clean the board in an ultrasonic bath or with isopropyl alcohol and a brush.",
    "Inspect under the microscope for corrosion around the PMIC, SMC, and CPU rails.",
    "Reflow or replace corroded components and re-test rails before reassembly.",
  ]),
  article("Nintendo Switch Won't Charge: M92T36 and P13USB", "Repair Guides/Console/Switch", [
    "The Switch charging path runs USB-C to the M92T36 PD/charging IC, then to BQ24193 and the battery.",
    "A failed M92T36 causes no-charge, overheating around the USB-C port, and sometimes backlight issues.",
  ], [
    "Inspect the USB-C port for bent or burnt pins; reflow or replace the port first.",
    "Check for shorts on the 5V VBUS and the M92T36 supply rails.",
    "Replace M92T36 with a genuine part; counterfeit chips fail quickly.",
    "If dock video is also dead, check P13USB.",
  ]),
  article("Nintendo Switch No Dock Video: P13USB", "Repair Guides/Console/Switch", [
    "When the Switch works handheld but shows no picture in the dock, the P13USB USB/display mux is the usual cause.",
    "It routes USB 3.0 and DisplayPort signals to the USB-C connector.",
  ], [
    "Confirm the dock and HDMI cable work with another console.",
    "Replace P13USB; it is small and static-sensitive, so use proper hot-air technique.",
    "Test docking after the repair.",
  ]),
  article("PS4 HDMI Port Replacement and No-Video", "Repair Guides/Console/PS4", [
    "PS4 no-video is most often a physically damaged HDMI port or a failed HDMI encoder (MN864729, or MN86471A on older units).",
    "Inspect the port pins under magnification before assuming the IC failed.",
  ], [
    "Reflow or replace the HDMI port; many no-video PS4s are just bent center pins.",
    "If the port is good and there is still no signal, replace the HDMI encoder IC.",
    "Confirm standby and APU power rails are present.",
  ]),
  article("PS4 No Power / Blue Light", "Repair Guides/Console/PS4", [
    "A PS4 that clicks or shows a blinking blue light and shuts off may have a PSU, APU power, or overheating fault.",
    "Rule out the power supply and thermal paste before board-level work.",
  ], [
    "Test the internal PSU outputs.",
    "Reapply thermal paste and check the APU is not lifted.",
    "Measure standby rails and the BD7956 power management outputs.",
  ]),
  article("PS5 HDMI Retimer Replacement", "Repair Guides/Console/PS5", [
    "PS5 no-video commonly comes from a damaged HDMI port or the HDMI retimer IC near it.",
    "The port and the retimer are close together; port damage often takes out the retimer.",
  ], [
    "Inspect and reflow/replace the HDMI port.",
    "If the port is good, replace the HDMI retimer with hot air and fresh paste.",
    "Test all resolutions after the repair.",
  ]),
  article("Water Damage First Response", "Repair Guides/General/Liquid", [
    "The first hour matters most with liquid damage. The two worst things a customer can do are charge the device and try to power it on.",
    "Set expectations early: liquid damage is a best-effort repair, not a guaranteed one.",
  ], [
    "Power off and disconnect the battery as soon as possible.",
    "Do not use rice; it does nothing for corrosion.",
    "Open the device, remove shields, and clean with isopropyl alcohol.",
    "Inspect under the microscope and address corrosion before testing.",
  ]),
  article("Finding Shorts: Diode Mode Basics", "Repair Guides/Technique/Shorts", [
    "Diode mode on a multimeter measures the voltage drop across a junction and is the fastest way to find shorts to ground on a rail.",
    "A reading near zero (a few millivolts) on a power rail usually means a dead short.",
  ], [
    "Set the meter to diode mode, black probe on ground.",
    "Probe the rail. Compare to a known-good board or the other side of the same rail.",
    "Very low readings indicate a shorted capacitor or IC pulling the rail down.",
  ]),
  article("Finding Shorts: Thermal Camera and Freeze Spray", "Repair Guides/Technique/Shorts", [
    "When diode mode points to a rail but not a specific part, heat reveals the culprit. A shorted component dissipates power and warms up.",
    "A thermal camera or freeze spray (which evaporates fastest over the hot part) both work.",
  ], [
    "Apply a current-limited supply to the shorted rail at low voltage.",
    "Watch the thermal camera for the component that heats first.",
    "Alternatively, mist freeze spray and watch where it clears first.",
    "Remove or replace the shorted component and re-test the rail.",
  ]),
  article("Injecting Voltage Safely", "Repair Guides/Technique/Shorts", [
    "Voltage injection forces current into a shorted rail to heat the faulty part, but too much voltage or current can damage good components.",
    "Always current-limit and stay at or below the rail's normal voltage.",
  ], [
    "Set a bench supply to the rail voltage with a low current limit.",
    "Inject on the rail and ground, never reverse polarity.",
    "Find the hot component, then power down before removing it.",
  ]),
  article("BGA Reball Process Overview", "Repair Guides/Technique/BGA", [
    "Reballing replaces the solder balls under a BGA chip. It is required after removing a chip for reuse, or when joints have cracked.",
    "Cleanliness and the right ball size are the difference between a lasting repair and a callback.",
  ], [
    "Remove the chip with hot air and a controlled profile.",
    "Wick the old solder flat and clean the pads with flux and alcohol.",
    "Use a stencil and the correct ball size to apply fresh balls.",
    "Reflow the balls, clean, then re-seat the chip with fresh flux.",
  ]),
  article("Hot Air Profiles for Common Packages", "Repair Guides/Technique/Hot Air", [
    "Different packages need different airflow and temperature. Too aggressive and you lift pads or warp the board; too gentle and joints do not flow.",
    "Preheat the board to reduce thermal shock, especially on large ground planes.",
  ], [
    "Small WLCSP/QFN: lower airflow, focused nozzle, watch surrounding parts.",
    "Large BGA: preheat, wider nozzle, steady ramp to reflow.",
    "Use flux to improve heat transfer and protect joints.",
  ]),
  article("Soldering Iron Tip Care", "Repair Guides/Technique/Soldering", [
    "A clean, tinned tip transfers heat efficiently. Oxidized tips ruin joints and tempt you to crank the temperature.",
    "Keep the iron at the lowest temperature that reliably flows your solder.",
  ], [
    "Tin the tip on power-up and before storing.",
    "Wipe on brass wool, not a dry sponge, between joints.",
    "Use tip tinner to recover a lightly oxidized tip.",
  ]),
  article("Flux Types: No-Clean, Rosin, Water-Soluble", "Repair Guides/Materials/Flux", [
    "Flux removes oxidation so solder wets properly. The three common families behave differently and need different cleanup.",
    "Match the flux to the job and always clean residue on fine-pitch work.",
  ], [
    "No-clean: low residue, convenient, but still clean for reliability on dense boards.",
    "Rosin: strong, classic, requires alcohol cleanup.",
    "Water-soluble: very active, must be fully washed off or it corrodes.",
  ]),
  article("ESD Safety at the Bench", "Repair Guides/Safety/ESD", [
    "Static discharge can damage ICs invisibly, causing intermittent or delayed failures. Microsoldering work is especially sensitive.",
    "A grounded mat and wrist strap are cheap insurance.",
  ], [
    "Use an ESD mat connected to ground.",
    "Wear a wrist strap when handling boards and loose ICs.",
    "Store sensitive parts in anti-static bags.",
  ]),
  article("Li-ion Battery Safety", "Repair Guides/Safety/Battery", [
    "Lithium batteries store a lot of energy and can vent or ignite if punctured, crushed, or shorted.",
    "Swollen batteries are a disposal item, not a charge-and-test item.",
  ], [
    "Never puncture or bend a battery during removal.",
    "Isolate swollen batteries and dispose of them properly.",
    "Keep a fire-safe container or sand bucket nearby.",
  ]),
  article("Laptop No Power: Adapter, Charger IC, EC Reset", "Repair Guides/Laptop/No Power", [
    "Laptop no-power has a logical order: confirm the adapter, then the DC-in and charging IC, then the embedded controller and power sequencing.",
    "Many no-power laptops are simply a dead adapter or a stuck EC.",
  ], [
    "Verify the adapter outputs the correct voltage.",
    "Check the DC jack and the charging IC enable rail.",
    "Try an EC reset (hold power with no battery/adapter), then re-test.",
    "Move to board-level rail measurement if power still does not sequence.",
  ]),
  article("Reading Boardview and Schematic Files", "Repair Guides/Technique/Boardview", [
    "Boardview files (.brd, .asc, .cad) let you locate components, nets, and test points on a board, and schematics show how rails are generated.",
    "userrepair opens boardview and schematic files in your system's default viewer from the Board Tools page.",
  ], [
    "Use the boardview to jump from a net name to its test points.",
    "Cross-reference the schematic to see which IC generates a rail.",
    "Log the expected values you find into the board's test-point index.",
  ]),
  article("Samsung USB-C Charging Port Replacement", "Repair Guides/Samsung/Charging", [
    "Most Samsung charging ports are on a replaceable sub-board or flex, which makes no-charge repairs quick when the port is the fault.",
    "Confirm the fault is the port and not the battery or board before ordering parts.",
  ], [
    "Test with a known-good cable and charger.",
    "Replace the charging port flex/sub-board.",
    "Verify fast-charge negotiation after the repair.",
  ]),
  article("TV No Backlight: Strips and Driver", "Repair Guides/TV/Backlight", [
    "A TV with sound and a faint image under a flashlight but no backlight usually has failed LED strips or a backlight driver fault.",
    "Measure the backlight voltage and check for an over-current shutdown.",
  ], [
    "Confirm the panel shows an image with a flashlight (backlight-only fault).",
    "Measure the LED driver output; a protection shutdown points to a shorted strip.",
    "Replace the failed LED strips as a set and re-test.",
  ]),
  article("TV No Power: Power Board and Capacitors", "Repair Guides/TV/Power", [
    "A dead TV often has a failed power (SMPS) board, frequently bulging or vented capacitors on the standby supply.",
    "Standby voltage should be present whenever the set is plugged in.",
  ], [
    "Measure the standby rail on the power board.",
    "Inspect for bulging/leaking capacitors and replace the affected ones.",
    "Re-test standby and power-on sequencing.",
  ]),
];

// ---------------------------------------------------------------------------
// Microcontrollers (real MCU families + dev boards). Emitted to a SEPARATE
// file / migration so existing databases pick them up too.
// ---------------------------------------------------------------------------
const mcuRows = [];
function mcu(brand, family, partType, list) {
  for (const [pn, pkg, desc] of list) {
    mcuRows.push({
      category: "Microcontroller",
      brand,
      device_family: family,
      device_models: family,
      part_type: partType,
      name: pn,
      designator: null,
      manufacturer_pn: pn,
      package: pkg,
      description: desc,
      notes: null,
    });
  }
}

mcu("STMicroelectronics", "STM32 (ARM Cortex-M)", "Microcontroller", [
  ["STM32F030F4", "TSSOP-20", "Cortex-M0 value-line MCU"],
  ["STM32F042K6", "LQFP-32", "Cortex-M0 with USB"],
  ["STM32F072RB", "LQFP-64", "Cortex-M0 USB / CAN"],
  ["STM32F103C8T6", "LQFP-48", "Cortex-M3 (popular Blue Pill)"],
  ["STM32F103RBT6", "LQFP-64", "Cortex-M3"],
  ["STM32F207ZG", "LQFP-144", "Cortex-M3 high density"],
  ["STM32F303CC", "LQFP-48", "Cortex-M4 mixed-signal"],
  ["STM32F401CC", "LQFP-48", "Cortex-M4 access line"],
  ["STM32F411CEU6", "UFQFPN-48", "Cortex-M4 (popular Black Pill)"],
  ["STM32F407VGT6", "LQFP-100", "Cortex-M4 with FPU"],
  ["STM32F429ZI", "LQFP-144", "Cortex-M4 with LCD-TFT"],
  ["STM32F446RE", "LQFP-64", "Cortex-M4 high performance"],
  ["STM32G030F6", "TSSOP-20", "Cortex-M0+ value line"],
  ["STM32G071RB", "LQFP-64", "Cortex-M0+ with USB-C PD"],
  ["STM32G431CB", "LQFP-48", "Cortex-M4 motor/digital power"],
  ["STM32G474RE", "LQFP-64", "Cortex-M4 with HRTIM"],
  ["STM32L011F4", "TSSOP-20", "Cortex-M0+ ultra-low-power"],
  ["STM32L053C8", "LQFP-48", "Cortex-M0+ low power"],
  ["STM32L432KC", "UFQFPN-32", "Cortex-M4 ultra-low-power"],
  ["STM32L476RG", "LQFP-64", "Cortex-M4 ultra-low-power"],
  ["STM32H743VI", "LQFP-100", "Cortex-M7 480MHz"],
  ["STM32H750VB", "LQFP-100", "Cortex-M7 value line"],
  ["STM32U575ZI", "LQFP-144", "Cortex-M33 secure low-power"],
]);
mcu("STMicroelectronics", "STM32 Wireless", "Wireless MCU", [
  ["STM32WB55RG", "VFQFPN-68", "Cortex-M4 + M0 BLE / Zigbee"],
  ["STM32WL55JC", "UFBGA-73", "Cortex-M4 + M0 LoRa / sub-GHz"],
]);
mcu("Microchip / Atmel", "AVR (megaAVR)", "Microcontroller", [
  ["ATmega328P", "PDIP-28 / TQFP-32", "8-bit AVR (Arduino Uno/Nano)"],
  ["ATmega328PB", "TQFP-32", "Updated ATmega328 with extra peripherals"],
  ["ATmega168", "PDIP-28", "8-bit AVR"],
  ["ATmega8A", "PDIP-28", "8-bit AVR classic"],
  ["ATmega16", "PDIP-40", "8-bit AVR"],
  ["ATmega32A", "PDIP-40", "8-bit AVR"],
  ["ATmega2560", "TQFP-100", "8-bit AVR (Arduino Mega)"],
  ["ATmega1284P", "PDIP-40", "8-bit AVR large SRAM"],
  ["ATmega32U4", "TQFP-44", "8-bit AVR with USB (Leonardo/Pro Micro)"],
  ["AT90USB1286", "TQFP-64", "8-bit AVR USB host/device (Teensy 2.0++)"],
]);
mcu("Microchip / Atmel", "AVR (tinyAVR)", "Microcontroller", [
  ["ATtiny13A", "PDIP-8 / SOIC-8", "8-bit AVR tiny"],
  ["ATtiny25", "SOIC-8", "8-bit AVR tiny"],
  ["ATtiny45", "SOIC-8", "8-bit AVR tiny"],
  ["ATtiny85", "PDIP-8 / SOIC-8", "8-bit AVR tiny (Digispark)"],
  ["ATtiny84", "SOIC-14", "8-bit AVR tiny"],
  ["ATtiny2313A", "PDIP-20", "8-bit AVR tiny"],
  ["ATtiny412", "SOIC-8", "New-gen tinyAVR 0/1-series"],
  ["ATtiny1614", "SOIC-14", "New-gen tinyAVR 1-series"],
]);
mcu("Microchip / Atmel", "SAM (ARM Cortex-M)", "Microcontroller", [
  ["ATSAMD21G18", "TQFP-48", "Cortex-M0+ (Arduino Zero)"],
  ["ATSAMD51J19", "TQFP-64", "Cortex-M4F high performance"],
  ["ATSAM3X8E", "LQFP-144", "Cortex-M3 (Arduino Due)"],
  ["ATSAMD09D14", "QFN-24", "Cortex-M0+ tiny"],
]);
mcu("Microchip", "PIC", "Microcontroller", [
  ["PIC10F200", "SOT-23-6", "6-pin 8-bit PIC"],
  ["PIC12F508", "PDIP-8", "8-bit PIC"],
  ["PIC12F675", "PDIP-8", "8-bit PIC with ADC"],
  ["PIC12F683", "PDIP-8", "8-bit PIC"],
  ["PIC16F84A", "PDIP-18", "Classic 8-bit PIC"],
  ["PIC16F628A", "PDIP-18", "8-bit PIC"],
  ["PIC16F676", "PDIP-14", "8-bit PIC"],
  ["PIC16F877A", "PDIP-40", "Popular 8-bit PIC"],
  ["PIC16F1827", "PDIP-18", "Enhanced mid-range PIC"],
  ["PIC18F2550", "PDIP-28", "8-bit PIC with USB"],
  ["PIC18F4550", "PDIP-40", "8-bit PIC with USB"],
  ["PIC18F45K22", "PDIP-40", "8-bit PIC XLP"],
  ["dsPIC30F4011", "PDIP-40", "16-bit DSC"],
  ["dsPIC33FJ128GP", "TQFP-64", "16-bit DSC"],
  ["PIC24FJ64GA002", "SPDIP-28", "16-bit PIC"],
]);
mcu("Espressif", "ESP32 / ESP8266", "Wireless MCU", [
  ["ESP8266EX", "QFN-32", "Wi-Fi SoC"],
  ["ESP-12F", "Module", "ESP8266 Wi-Fi module"],
  ["ESP32-WROOM-32", "Module", "Wi-Fi + BLE dual-core module"],
  ["ESP32-WROVER-E", "Module", "ESP32 with PSRAM"],
  ["ESP32-S2", "QFN-56", "Single-core Wi-Fi with USB-OTG"],
  ["ESP32-S3", "QFN-56", "Dual-core Wi-Fi + BLE with AI"],
  ["ESP32-C3", "QFN-32", "RISC-V Wi-Fi + BLE"],
  ["ESP32-C6", "QFN-40", "RISC-V Wi-Fi 6 + BLE + Thread"],
  ["ESP32-H2", "QFN-40", "RISC-V BLE + Thread/Zigbee"],
]);
mcu("Raspberry Pi", "RP2040 / RP2350", "Microcontroller", [
  ["RP2040", "QFN-56", "Dual Cortex-M0+ (Raspberry Pi Pico)"],
  ["RP2350", "QFN-60", "Dual Cortex-M33 / RISC-V (Pico 2)"],
]);
mcu("Nordic Semiconductor", "nRF5x", "Wireless MCU", [
  ["nRF51822", "QFN-48", "Cortex-M0 BLE SoC"],
  ["nRF52810", "QFN-48", "Cortex-M4 BLE SoC"],
  ["nRF52832", "QFN-48", "Cortex-M4F BLE SoC"],
  ["nRF52840", "QFN-73", "Cortex-M4F BLE / Thread / USB"],
  ["nRF52833", "QFN-73", "Cortex-M4F BLE (BBC micro:bit v2)"],
  ["nRF5340", "QFN-94", "Dual Cortex-M33 BLE"],
  ["nRF9160", "LGA-127", "Cortex-M33 LTE-M / NB-IoT"],
]);
mcu("Texas Instruments", "MSP430 / Tiva / CC", "Microcontroller", [
  ["MSP430G2553", "PDIP-20", "16-bit ultra-low-power (LaunchPad)"],
  ["MSP430F5529", "LQFP-80", "16-bit with USB"],
  ["MSP430FR2433", "TSSOP-24", "16-bit FRAM MCU"],
  ["MSP430FR5969", "LQFP-48", "16-bit FRAM MCU"],
  ["TM4C123GH6PM", "LQFP-64", "Cortex-M4F (Tiva C)"],
  ["CC2541", "QFN-40", "8051-based BLE SoC"],
  ["CC2640R2F", "QFN-48", "Cortex-M3 BLE 5"],
  ["CC1310", "QFN-48", "Cortex-M3 sub-GHz"],
]);
mcu("NXP / Freescale", "LPC / Kinetis / i.MX RT", "Microcontroller", [
  ["LPC1114", "PDIP-28 / LQFP-48", "Cortex-M0"],
  ["LPC1768", "LQFP-100", "Cortex-M3 (mbed)"],
  ["MK20DX256VLH7", "LQFP-64", "Cortex-M4 (Teensy 3.2)"],
  ["MKL26Z64", "LQFP-48", "Cortex-M0+"],
  ["MIMXRT1062DVL6A", "BGA-196", "Cortex-M7 600MHz (Teensy 4.0/4.1)"],
  ["S32K144", "LQFP-100", "Cortex-M4F automotive"],
]);
mcu("Silicon Labs", "EFM32 / EFR32 / C8051", "Microcontroller", [
  ["EFM32G890F128", "QFP-64", "Cortex-M3 Gecko"],
  ["EFR32BG22", "QFN-40", "Cortex-M33 BLE"],
  ["C8051F340", "LQFP-48", "8051 with USB"],
]);
mcu("Infineon / Cypress", "PSoC", "Microcontroller", [
  ["CY8C4245AXI", "TQFP-44", "PSoC 4 Cortex-M0"],
  ["CY8C5888LTI", "QFN-68", "PSoC 5LP Cortex-M3"],
  ["CY8C6247BZI", "BGA-124", "PSoC 6 dual-core Cortex-M4/M0+"],
]);
mcu("Renesas", "RL78 / RX / RA", "Microcontroller", [
  ["RL78/G13 R5F100LE", "LQFP-64", "16-bit low-power"],
  ["RX231 R5F52318", "LQFP-100", "32-bit RXv2"],
  ["RA4M1 R7FA4M1AB", "LQFP-64", "Cortex-M4 (Arduino Uno R4)"],
]);
mcu("Nuvoton", "8051 / Cortex-M", "Microcontroller", [
  ["N76E003AT20", "TSSOP-20", "Enhanced 8051"],
  ["M032 / M031", "LQFP-64", "Cortex-M0"],
]);
mcu("WCH", "CH32 / CH55x (RISC-V / 8051)", "Microcontroller", [
  ["CH32V003", "SOP-8 / TSSOP-20", "RISC-V ultra-low-cost"],
  ["CH32V307", "LQFP-64", "RISC-V with Ethernet"],
  ["CH552G", "SOP-16", "8051 with USB"],
  ["CH582F", "QFN-48", "RISC-V BLE"],
]);
mcu("GigaDevice", "GD32", "Microcontroller", [
  ["GD32F103C8", "LQFP-48", "Cortex-M3 (STM32F103 alternative)"],
  ["GD32F303CC", "LQFP-48", "Cortex-M4"],
  ["GD32VF103CB", "LQFP-48", "RISC-V"],
]);
mcu("8051 / classic", "8051 family", "Microcontroller", [
  ["AT89S52", "PDIP-40", "8051 with ISP"],
  ["AT89C2051", "PDIP-20", "8051 low pin count"],
  ["STC89C52RC", "PDIP-40", "8051 clone"],
  ["P89V51RD2", "PDIP-40", "8051 with ISP/IAP"],
]);
mcu("Parallax", "Propeller", "Microcontroller", [
  ["P8X32A", "LQFP-44", "8-core multicore MCU"],
]);
mcu("Various", "Development Boards", "Dev Board", [
  ["Arduino Uno R3", "Board", "ATmega328P development board"],
  ["Arduino Uno R4 Minima", "Board", "Renesas RA4M1 board"],
  ["Arduino Nano", "Board", "Compact ATmega328P board"],
  ["Arduino Nano Every", "Board", "ATmega4809 board"],
  ["Arduino Mega 2560", "Board", "ATmega2560 board"],
  ["Arduino Leonardo", "Board", "ATmega32U4 board"],
  ["Arduino Micro", "Board", "ATmega32U4 compact board"],
  ["Arduino Pro Mini", "Board", "Minimal ATmega328P board"],
  ["Arduino Due", "Board", "SAM3X8E Cortex-M3 board"],
  ["Arduino Zero", "Board", "SAMD21 Cortex-M0+ board"],
  ["Arduino Nano 33 BLE", "Board", "nRF52840 board"],
  ["Raspberry Pi Pico", "Board", "RP2040 board"],
  ["Raspberry Pi Pico W", "Board", "RP2040 board with Wi-Fi"],
  ["ESP32 DevKitC", "Board", "ESP32-WROOM-32 dev board"],
  ["Wemos D1 Mini", "Board", "ESP8266 dev board"],
  ["NodeMCU", "Board", "ESP8266 dev board"],
  ["BBC micro:bit v2", "Board", "nRF52833 education board"],
  ["Teensy 4.0", "Board", "i.MX RT1062 Cortex-M7 board"],
  ["Teensy 4.1", "Board", "i.MX RT1062 board with Ethernet"],
  ["STM32 Nucleo-F103RB", "Board", "STM32F103 Nucleo board"],
  ["STM32 Blue Pill", "Board", "STM32F103C8 board"],
  ["Black Pill", "Board", "STM32F411CE board"],
  ["Seeed XIAO SAMD21", "Board", "Tiny SAMD21 board"],
  ["Seeed XIAO ESP32-C3", "Board", "Tiny ESP32-C3 board"],
  ["Adafruit Feather M0", "Board", "SAMD21 Feather board"],
]);

// ---------------------------------------------------------------------------
// Raspberry Pi family (single-board computers, compute modules, Pico boards).
// Emitted to its own file / migration.
// ---------------------------------------------------------------------------
const rpiRows = [];
function rpi(partType, category, list) {
  for (const [name, soc, desc] of list) {
    rpiRows.push({
      category,
      brand: "Raspberry Pi",
      device_family: "Raspberry Pi",
      device_models: name,
      part_type: partType,
      name,
      designator: null,
      manufacturer_pn: soc,
      package: null,
      description: desc,
      notes: null,
    });
  }
}
rpi("Single-Board Computer", "Single-Board Computer", [
  ["Raspberry Pi 1 Model A", "BCM2835", "Original single-core 700MHz SBC"],
  ["Raspberry Pi 1 Model B", "BCM2835", "Original single-core SBC with Ethernet"],
  ["Raspberry Pi 1 Model A+", "BCM2835", "Compact single-core SBC"],
  ["Raspberry Pi 1 Model B+", "BCM2835", "Single-core SBC, 40-pin GPIO"],
  ["Raspberry Pi 2 Model B", "BCM2836", "Quad-core Cortex-A7 SBC"],
  ["Raspberry Pi 3 Model A+", "BCM2837B0", "Compact quad-core SBC"],
  ["Raspberry Pi 3 Model B", "BCM2837", "Quad-core Cortex-A53 with Wi-Fi/Bluetooth"],
  ["Raspberry Pi 3 Model B+", "BCM2837B0", "Quad-core with faster Wi-Fi and PoE header"],
  ["Raspberry Pi 4 Model B", "BCM2711", "Quad-core Cortex-A72, 1/2/4/8GB, dual micro-HDMI, USB3"],
  ["Raspberry Pi 400", "BCM2711", "Pi 4 built into a keyboard"],
  ["Raspberry Pi 5", "BCM2712", "Quad-core Cortex-A76, 4/8/16GB, PCIe, dual 4K"],
  ["Raspberry Pi 500", "BCM2712", "Pi 5 built into a keyboard"],
  ["Raspberry Pi Zero", "BCM2835", "Ultra-compact single-core SBC"],
  ["Raspberry Pi Zero W", "BCM2835", "Zero with Wi-Fi/Bluetooth"],
  ["Raspberry Pi Zero WH", "BCM2835", "Zero W with pre-soldered header"],
  ["Raspberry Pi Zero 2 W", "RP3A0 (BCM2710A1)", "Quad-core compact SBC with wireless"],
]);
rpi("Compute Module", "Single-Board Computer", [
  ["Raspberry Pi Compute Module 1", "BCM2835", "SODIMM-form compute module"],
  ["Raspberry Pi Compute Module 3", "BCM2837", "Compute module"],
  ["Raspberry Pi Compute Module 3+", "BCM2837B0", "Compute module"],
  ["Raspberry Pi Compute Module 4", "BCM2711", "Compute module (new form factor)"],
  ["Raspberry Pi Compute Module 4S", "BCM2711", "CM4 in SODIMM form factor"],
  ["Raspberry Pi Compute Module 5", "BCM2712", "Compute module"],
]);
rpi("Dev Board", "Microcontroller", [
  ["Raspberry Pi Pico 2", "RP2350", "Dual Cortex-M33 / RISC-V board"],
  ["Raspberry Pi Pico 2 W", "RP2350", "Pico 2 with Wi-Fi/Bluetooth"],
  ["Raspberry Pi Pico H", "RP2040", "Pico with pre-soldered headers"],
  ["Raspberry Pi Pico WH", "RP2040", "Pico W with pre-soldered headers"],
]);

// ---------------------------------------------------------------------------
// Bulk board revisions for every phone / tablet model. Family-typical component
// sets and rails (plus known Apple ICs per generation). Emitted to its own file.
// ---------------------------------------------------------------------------
const BOARD_BULK_BASE = 200000;

const PHONE_BASE_COMPONENTS = [
  ["J_DISP", "Connector", "Display FPC connector"],
  ["J_BATT", "Connector", "Battery FPC connector"],
  ["J_CHG", "Connector", "Charge port / dock connector"],
  ["J_FCAM", "Connector", "Front camera connector"],
  ["J_RCAM", "Connector", "Rear camera connector"],
  ["U_PMIC", "PMIC", "Main power management IC"],
  ["U_CHG", "Charging IC", "USB charging / interface IC"],
  ["U_AUDIO", "Audio IC", "Audio codec IC"],
  ["U_NAND", "NAND Flash", "Flash storage"],
];
const TABLET_BASE_COMPONENTS = [
  ["J_LCD", "Connector", "LCD FPC connector"],
  ["J_DIG", "Connector", "Digitizer FPC connector"],
  ["J_BATT", "Connector", "Battery FPC connector"],
  ["J_CHG", "Connector", "Charge port connector"],
  ["U_PMIC", "PMIC", "Main power management IC"],
  ["U_CHG", "Charging IC", "USB charging IC"],
  ["U_NAND", "NAND Flash", "Flash storage"],
];
const PHONE_RAILS = [
  { tp: "VBAT", rail: "VBAT / PP_BATT_VCC", state: "off", exp: "3.8", units: "V", note: "Battery main rail (typically 3.0-4.35V with charge)." },
  { tp: "VBUS_5V", rail: "VBUS", state: "on", exp: "5.0", units: "V", note: "USB VBUS when charging." },
  { tp: "PP1V8", rail: "1V8", state: "on", exp: "1.8", units: "V", note: "1.8V housekeeping rail (typical)." },
  { tp: "PP3V0", rail: "3V0", state: "on", exp: "3.0", units: "V", note: "3.0V rail (typical)." },
];
const TABLET_RAILS = [
  { tp: "VBAT", rail: "VBAT / PP_BATT_VCC", state: "off", exp: "3.8", units: "V", note: "Battery main rail (typically 3.0-4.35V with charge)." },
  { tp: "VBUS_5V", rail: "VBUS", state: "on", exp: "5.0", units: "V", note: "USB VBUS when charging." },
  { tp: "PP5V0", rail: "5V0", state: "on", exp: "5.0", units: "V", note: "5V rail (typical)." },
  { tp: "PP1V8", rail: "1V8", state: "on", exp: "1.8", units: "V", note: "1.8V housekeeping rail (typical)." },
  { tp: "PP3V3", rail: "3V3", state: "on", exp: "3.3", units: "V", note: "3.3V rail (typical)." },
];

function appleKnownComponents(model) {
  const out = [];
  for (const ic of APPLE_ICS) {
    if (ic.models.split(",").map((s) => s.trim()).includes(model)) {
      out.push({ ref: ic.designator ?? "U?", type: ic.pt, value: null, pn: ic.mpn, note: ic.name });
    }
  }
  return out;
}

const bulkBoards = [];
let bbid = BOARD_BULK_BASE;
function buildBulkBoard(brand, family, category, model) {
  const isTablet = category === "Tablet";
  const base = isTablet ? TABLET_BASE_COMPONENTS : PHONE_BASE_COMPONENTS;
  const rails = isTablet ? TABLET_RAILS : PHONE_RAILS;
  let components = base.map(([ref, type, note]) => ({ ref, type, value: null, pn: null, note }));

  if (brand === "Apple") {
    // Replace the generic charging IC with the known one for this generation.
    const known = appleKnownComponents(model);
    components = components.concat(known);
  } else if (brand === "Samsung") {
    components.push({ ref: "U_CHG2", type: "Charging IC", value: null, pn: null, note: "USB-C / charging IC (MAX77705 / S2MU-series typical)" });
    components.push({ ref: "U_SUBPMIC", type: "PMIC", value: null, pn: null, note: "Sub-PMIC (S2MPS / S2DOS typical)" });
  }

  bulkBoards.push({
    id: bbid++,
    device_model: `${brand} ${model}`,
    revision: "Logic Board",
    layer_count: null,
    primary_soc: null,
    pmic: "U_PMIC",
    notes: `${brand} ${model} main logic board. Component set and rails are family-typical reference values; confirm exact values against the boardview/schematic for this unit.`,
    components,
    testPoints: rails.map((r) => ({ label: r.tp, location: "see boardview", v: `${r.exp}${r.units}`, r: null })),
    nets: rails.map((r) => ({ name: r.rail, tp: r.tp, exp: r.exp, units: r.units })),
    knownGood: rails.map((r) => ({ kind: "voltage", tp: r.tp, ref: null, rail: r.rail, state: r.state, exp: r.exp, meas: r.exp, units: r.units, note: r.note })),
  });
}

// iPhone 5 and newer / iPad 2 and newer already covered by the model lists.
for (const [brand, family, models] of PHONE_GROUPS) {
  for (const model of models) {
    if (brand === "Apple" && /iPhone 4/.test(model)) continue; // iPhone 5+ only
    buildBulkBoard(brand, family, "Mobile", model);
  }
}
for (const [brand, family, models] of TABLET_GROUPS) {
  for (const model of models) {
    buildBulkBoard(brand, family, "Tablet", model);
  }
}

// ---------------------------------------------------------------------------
// Consoles: PlayStation, Xbox, all Nintendo, all Sega, and more. Board
// revisions with era-appropriate components and rails. Own file / migration.
// ---------------------------------------------------------------------------
const CONSOLE_ID_BASE = 300000;
const ERA_COMPONENTS = {
  cart: [
    ["U_CPU", "CPU / Processor", "Main processor"],
    ["U_PPU", "Video / PPU", "Picture processing unit"],
    ["U_RAM", "RAM", "Work/video RAM"],
    ["J_CART", "Connector", "Cartridge edge connector"],
    ["J_CTRL", "Connector", "Controller port(s)"],
    ["U_REG", "Voltage Regulator", "5V regulator (e.g. 7805)"],
    ["J_PWR", "Connector", "Power input connector"],
    ["J_AV", "Connector", "A/V or RF output"],
  ],
  disc: [
    ["U_CPU", "CPU", "Main processor"],
    ["U_GPU", "GPU", "Graphics processor"],
    ["U_RAM", "RAM", "System RAM"],
    ["J_ODD", "Connector", "Optical drive ribbon connector"],
    ["U_BIOS", "BIOS ROM", "BIOS / boot ROM"],
    ["J_CTRL", "Connector", "Controller ports"],
    ["U_AV", "A/V Encoder", "Video encoder / DAC"],
    ["J_PSU", "Connector", "Power supply connector"],
  ],
  hd: [
    ["U_APU", "APU / CPU", "Main APU or CPU+GPU"],
    ["U_SB", "Southbridge", "I/O southbridge"],
    ["U_RAM", "RAM", "GDDR / system memory"],
    ["U_HDMI", "HDMI IC", "HDMI encoder / retimer"],
    ["U_NAND", "NAND Flash", "Onboard flash"],
    ["U_PMIC", "PMIC", "Power management IC"],
    ["J_ODD", "Connector", "Optical drive connector"],
    ["J_HDMI", "Connector", "HDMI port"],
    ["J_FAN", "Connector", "Cooling fan connector"],
  ],
  current: [
    ["U_APU", "APU", "Main APU"],
    ["U_HDMI", "HDMI IC", "HDMI retimer / redriver"],
    ["U_NAND", "Storage", "NAND / SSD"],
    ["U_PMIC", "PMIC", "Power management IC"],
    ["J_HDMI", "Connector", "HDMI port"],
    ["J_FAN", "Connector", "Cooling fan connector"],
    ["J_PSU", "Connector", "Power supply connector"],
  ],
  handheld: [
    ["U_SOC", "SoC", "Main system-on-chip"],
    ["J_LCD", "Connector", "LCD / display connector"],
    ["J_BATT", "Connector", "Battery connector"],
    ["U_CHG", "Charging IC", "Battery charging IC"],
    ["J_BTN", "Connector", "Button / control flex"],
    ["U_PMIC", "PMIC", "Power management IC"],
    ["J_CART", "Connector", "Game card / cartridge connector"],
  ],
};
function consoleRails(era) {
  if (era === "cart" || era === "disc") {
    return [
      { tp: "5V", rail: "5V", state: "on", exp: "5.0", units: "V", note: "Regulated 5V logic supply." },
      { tp: "3V3", rail: "3V3", state: "on", exp: "3.3", units: "V", note: "3.3V rail (later boards)." },
    ];
  }
  if (era === "handheld") {
    return [
      { tp: "VBAT", rail: "VBAT", state: "off", exp: "3.7", units: "V", note: "Battery rail (3.0-4.2V)." },
      { tp: "3V3", rail: "3V3", state: "on", exp: "3.3", units: "V", note: "3.3V rail (typical)." },
      { tp: "1V8", rail: "1V8", state: "on", exp: "1.8", units: "V", note: "1.8V rail (typical)." },
    ];
  }
  // hd / current
  return [
    { tp: "STBY_5V", rail: "STBY_5V", state: "standby", exp: "5.0", units: "V", note: "Standby supply present when plugged in." },
    { tp: "3V3", rail: "3V3", state: "standby", exp: "3.3", units: "V", note: "Housekeeping 3.3V." },
    { tp: "12V", rail: "12V", state: "on", exp: "12.0", units: "V", note: "Main 12V rail from PSU (where applicable)." },
  ];
}
function consoleKnown(model) {
  const k = [];
  if (model === "PlayStation 4") k.push(["IC4001", "HDMI IC", "MN86471A", "HDMI encoder (original PS4)"]);
  if (model === "PlayStation 4 Slim" || model === "PlayStation 4 Pro") k.push(["IC4001", "HDMI IC", "MN864729", "HDMI encoder"]);
  if (/PlayStation 5/.test(model)) k.push(["U_RT", "HDMI Retimer", null, "HDMI retimer IC (common no-video)"]);
  if (/Xbox One|Xbox Series/.test(model)) k.push(["U_RT", "HDMI Retimer", null, "HDMI retimer IC (common no-video)"]);
  if (model.startsWith("Switch")) {
    k.push(["U1", "Charging IC", "M92T36", "USB-C PD / charging IC"]);
    k.push(["U3", "Display Mux", "P13USB", "USB / display mux"]);
    k.push(["U6", "Battery Charger", "BQ24193", "Battery charger IC"]);
  }
  return k.map(([ref, type, pn, note]) => ({ ref, type, value: null, pn, note }));
}

const CONSOLES = [
  ["Sony", "PlayStation", "PlayStation (PS1)", "disc"], ["Sony", "PlayStation", "PlayStation 2", "disc"],
  ["Sony", "PlayStation", "PlayStation 2 Slim", "disc"], ["Sony", "PlayStation", "PlayStation 3", "hd"],
  ["Sony", "PlayStation", "PlayStation 3 Slim", "hd"], ["Sony", "PlayStation", "PlayStation 3 Super Slim", "hd"],
  ["Sony", "PlayStation", "PlayStation 4", "hd"], ["Sony", "PlayStation", "PlayStation 4 Slim", "hd"],
  ["Sony", "PlayStation", "PlayStation 4 Pro", "hd"], ["Sony", "PlayStation", "PlayStation 5", "current"],
  ["Sony", "PlayStation", "PlayStation 5 Slim", "current"], ["Sony", "PlayStation", "PlayStation 5 Pro", "current"],
  ["Sony", "PlayStation", "PSP-1000", "handheld"], ["Sony", "PlayStation", "PSP-2000", "handheld"],
  ["Sony", "PlayStation", "PSP-3000", "handheld"], ["Sony", "PlayStation", "PSP Go", "handheld"],
  ["Sony", "PlayStation", "PS Vita 1000", "handheld"], ["Sony", "PlayStation", "PS Vita 2000", "handheld"],
  ["Microsoft", "Xbox", "Xbox (Original)", "disc"], ["Microsoft", "Xbox", "Xbox 360", "hd"],
  ["Microsoft", "Xbox", "Xbox 360 S", "hd"], ["Microsoft", "Xbox", "Xbox 360 E", "hd"],
  ["Microsoft", "Xbox", "Xbox One", "hd"], ["Microsoft", "Xbox", "Xbox One S", "hd"],
  ["Microsoft", "Xbox", "Xbox One X", "hd"], ["Microsoft", "Xbox", "Xbox Series S", "current"],
  ["Microsoft", "Xbox", "Xbox Series X", "current"],
  ["Nintendo", "Nintendo", "NES", "cart"], ["Nintendo", "Nintendo", "Super Nintendo (SNES)", "cart"],
  ["Nintendo", "Nintendo", "Nintendo 64", "cart"], ["Nintendo", "Nintendo", "GameCube", "disc"],
  ["Nintendo", "Nintendo", "Wii", "disc"], ["Nintendo", "Nintendo", "Wii U", "hd"],
  ["Nintendo", "Nintendo", "Switch", "handheld"], ["Nintendo", "Nintendo", "Switch Lite", "handheld"],
  ["Nintendo", "Nintendo", "Switch OLED", "handheld"],
  ["Nintendo", "Nintendo", "Game Boy", "handheld"], ["Nintendo", "Nintendo", "Game Boy Pocket", "handheld"],
  ["Nintendo", "Nintendo", "Game Boy Color", "handheld"], ["Nintendo", "Nintendo", "Game Boy Advance", "handheld"],
  ["Nintendo", "Nintendo", "Game Boy Advance SP", "handheld"], ["Nintendo", "Nintendo", "Game Boy Micro", "handheld"],
  ["Nintendo", "Nintendo", "Nintendo DS", "handheld"], ["Nintendo", "Nintendo", "Nintendo DS Lite", "handheld"],
  ["Nintendo", "Nintendo", "Nintendo DSi", "handheld"], ["Nintendo", "Nintendo", "Nintendo DSi XL", "handheld"],
  ["Nintendo", "Nintendo", "Nintendo 3DS", "handheld"], ["Nintendo", "Nintendo", "Nintendo 3DS XL", "handheld"],
  ["Nintendo", "Nintendo", "Nintendo 2DS", "handheld"], ["Nintendo", "Nintendo", "New Nintendo 3DS", "handheld"],
  ["Nintendo", "Nintendo", "New Nintendo 3DS XL", "handheld"], ["Nintendo", "Nintendo", "New Nintendo 2DS XL", "handheld"],
  ["Nintendo", "Nintendo", "Virtual Boy", "cart"],
  ["Sega", "Sega", "SG-1000", "cart"], ["Sega", "Sega", "Master System", "cart"],
  ["Sega", "Sega", "Genesis / Mega Drive", "cart"], ["Sega", "Sega", "Sega CD / Mega CD", "disc"],
  ["Sega", "Sega", "Sega 32X", "cart"], ["Sega", "Sega", "Sega Saturn", "disc"],
  ["Sega", "Sega", "Dreamcast", "disc"], ["Sega", "Sega", "Game Gear", "handheld"],
  ["Sega", "Sega", "Sega Nomad", "handheld"],
  ["Atari", "Atari", "Atari 2600", "cart"], ["Atari", "Atari", "Atari 5200", "cart"],
  ["Atari", "Atari", "Atari 7800", "cart"], ["Atari", "Atari", "Atari Jaguar", "cart"],
  ["Atari", "Atari", "Atari Lynx", "handheld"],
  ["NEC", "TurboGrafx", "TurboGrafx-16 / PC Engine", "cart"],
  ["SNK", "Neo Geo", "Neo Geo AES", "cart"], ["SNK", "Neo Geo", "Neo Geo MVS", "cart"],
  ["Panasonic", "3DO", "3DO Interactive Multiplayer", "disc"],
  ["Valve", "Steam Deck", "Steam Deck (LCD)", "handheld"], ["Valve", "Steam Deck", "Steam Deck OLED", "handheld"],
];

const consoleBoards = [];
let cbid = CONSOLE_ID_BASE;
for (const [brand, family, model, era] of CONSOLES) {
  const base = ERA_COMPONENTS[era];
  const components = base.map(([ref, type, note]) => ({ ref, type, value: null, pn: null, note })).concat(consoleKnown(model));
  const rails = consoleRails(era);
  consoleBoards.push({
    id: cbid++,
    device_model: `${brand} ${model}`,
    revision: era === "handheld" ? "Logic Board" : "Mainboard",
    layer_count: null,
    primary_soc: null,
    pmic: "U_PMIC",
    notes: `${brand} ${model} board. Component set and rails are era-typical reference values; confirm exact values against the boardview/schematic for this revision.`,
    components,
    testPoints: rails.map((r) => ({ label: r.tp, location: "see boardview", v: `${r.exp}${r.units}`, r: null })),
    nets: rails.map((r) => ({ name: r.rail, tp: r.tp, exp: r.exp, units: r.units })),
    knownGood: rails.map((r) => ({ kind: "voltage", tp: r.tp, ref: null, rail: r.rail, state: r.state, exp: r.exp, meas: r.exp, units: r.units, note: r.note })),
  });
}

// ---------------------------------------------------------------------------
// Knowledge base: one "Component Reference" article per device (every board).
// ---------------------------------------------------------------------------
function deviceArticle(b) {
  const compItems = b.components.map((c) => {
    const bits = [`<strong>${c.ref}</strong>`, c.type];
    if (c.pn) bits.push(`<code>${c.pn}</code>`);
    if (c.note) bits.push(c.note);
    return `<li>${bits.join(" - ")}</li>`;
  });
  const railItems = b.knownGood.map(
    (m) => `<li>${m.rail} (${m.tp}): ${m.exp} ${m.units} @ ${m.state} - ${m.note}</li>`,
  );
  const html =
    `<p>${b.notes}</p>` +
    `<h2>Components (${b.components.length})</h2><ul>${compItems.join("")}</ul>` +
    `<h2>Test points &amp; known-good rails</h2><ul>${railItems.join("")}</ul>`;
  const textParts = [b.notes];
  for (const c of b.components) textParts.push(`${c.ref} ${c.type} ${c.pn ?? ""} ${c.note ?? ""}`);
  for (const m of b.knownGood) textParts.push(`${m.rail} ${m.tp} ${m.exp} ${m.units} ${m.state}`);
  const text = textParts.join(" ").replace(/<[^>]+>/g, "");
  return {
    title: `${b.device_model} - Component Reference`,
    category: `Device Components/${b.device_model.split(" ")[0]}`,
    html,
    text,
  };
}
const deviceArticles = [...BOARDS, ...bulkBoards, ...consoleBoards].map(deviceArticle);

// ---------------------------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------------------------
function S(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function N(v) {
  return v === null || v === undefined ? "NULL" : String(v);
}

const out = [];
out.push("-- AUTO-GENERATED by scripts/seed-reference.mjs. Do not edit by hand.");
out.push("-- Reference catalog: parts, board revisions, known-good values, and articles.");
out.push("");

// reference_parts
out.push("-- reference_parts");
const refCols = "category, brand, device_family, device_models, part_type, name, designator, manufacturer_pn, package, description, notes";
for (let i = 0; i < refRows.length; i += 100) {
  const chunk = refRows.slice(i, i + 100);
  const values = chunk
    .map((r) => `(${S(r.category)}, ${S(r.brand)}, ${S(r.device_family)}, ${S(r.device_models)}, ${S(r.part_type)}, ${S(r.name)}, ${S(r.designator)}, ${S(r.manufacturer_pn)}, ${S(r.package)}, ${S(r.description)}, ${S(r.notes)})`)
    .join(",\n");
  out.push(`INSERT INTO reference_parts (${refCols}) VALUES\n${values};`);
}
out.push("");

// board revisions + children + known-good measurements
out.push("-- board revisions, indices, and known-good reference measurements");
for (const b of BOARDS) {
  out.push(
    `INSERT INTO board_revisions (id, device_model, revision, layer_count, primary_soc, pmic, notes) VALUES (${b.id}, ${S(b.device_model)}, ${S(b.revision)}, ${N(b.layer_count)}, ${S(b.primary_soc)}, ${S(b.pmic)}, ${S(b.notes)});`,
  );
  for (const c of b.components) {
    out.push(
      `INSERT INTO board_components (board_revision_id, reference_designator, component_type, value, part_number, notes) VALUES (${b.id}, ${S(c.ref)}, ${S(c.type)}, ${S(c.value)}, ${S(c.pn)}, ${S(c.note)});`,
    );
  }
  for (const t of b.testPoints) {
    out.push(
      `INSERT INTO board_test_points (board_revision_id, label, location_desc, expected_voltage, expected_resistance) VALUES (${b.id}, ${S(t.label)}, ${S(t.location)}, ${S(t.v)}, ${S(t.r)});`,
    );
  }
  for (const n of b.nets) {
    out.push(
      `INSERT INTO board_nets (board_revision_id, net_name, test_point, expected_value, units) VALUES (${b.id}, ${S(n.name)}, ${S(n.tp)}, ${S(n.exp)}, ${S(n.units)});`,
    );
  }
  for (const m of b.knownGood) {
    out.push(
      `INSERT INTO measurements (board_revision_id, kind, test_point, reference_designator, rail_name, power_state, expected_value, measured_value, units, notes, is_known_good) VALUES (${b.id}, ${S(m.kind)}, ${S(m.tp)}, ${S(m.ref)}, ${S(m.rail)}, ${S(m.state)}, ${S(m.exp)}, ${S(m.meas)}, ${S(m.units)}, ${S(m.note)}, 1);`,
    );
  }
}
out.push("");

// knowledge articles
out.push("-- knowledge base articles");
for (const a of ARTICLES) {
  out.push(
    `INSERT INTO knowledge_articles (title, category, body_html, body_text) VALUES (${S(a.title)}, ${S(a.category)}, ${S(a.html)}, ${S(a.text)});`,
  );
}
out.push("");

const sql = out.join("\n");
writeFileSync(new URL("../src-tauri/src/db/seed_reference.sql", import.meta.url), sql);

// Microcontrollers go in a separate migration file so existing databases (which
// already applied the reference seed) also receive them.
const out2 = [];
out2.push("-- AUTO-GENERATED by scripts/seed-reference.mjs. Do not edit by hand.");
out2.push("-- Microcontrollers and development boards for the parts reference catalog.");
out2.push("");
for (let i = 0; i < mcuRows.length; i += 100) {
  const chunk = mcuRows.slice(i, i + 100);
  const values = chunk
    .map((r) => `(${S(r.category)}, ${S(r.brand)}, ${S(r.device_family)}, ${S(r.device_models)}, ${S(r.part_type)}, ${S(r.name)}, ${S(r.designator)}, ${S(r.manufacturer_pn)}, ${S(r.package)}, ${S(r.description)}, ${S(r.notes)})`)
    .join(",\n");
  out2.push(`INSERT INTO reference_parts (${refCols}) VALUES\n${values};`);
}
const sql2 = out2.join("\n");
writeFileSync(new URL("../src-tauri/src/db/seed_microcontrollers.sql", import.meta.url), sql2);

// Raspberry Pi family -> its own migration file.
const out3 = [];
out3.push("-- AUTO-GENERATED by scripts/seed-reference.mjs. Do not edit by hand.");
out3.push("-- Raspberry Pi single-board computers, compute modules, and Pico boards.");
out3.push("");
for (let i = 0; i < rpiRows.length; i += 100) {
  const chunk = rpiRows.slice(i, i + 100);
  const values = chunk
    .map((r) => `(${S(r.category)}, ${S(r.brand)}, ${S(r.device_family)}, ${S(r.device_models)}, ${S(r.part_type)}, ${S(r.name)}, ${S(r.designator)}, ${S(r.manufacturer_pn)}, ${S(r.package)}, ${S(r.description)}, ${S(r.notes)})`)
    .join(",\n");
  out3.push(`INSERT INTO reference_parts (${refCols}) VALUES\n${values};`);
}
const sql3 = out3.join("\n");
writeFileSync(new URL("../src-tauri/src/db/seed_raspberry_pi.sql", import.meta.url), sql3);

// Bulk board revisions for every phone/tablet model -> its own migration file.
function boardStatements(b) {
  const lines = [];
  lines.push(
    `INSERT INTO board_revisions (id, device_model, revision, layer_count, primary_soc, pmic, notes) VALUES (${b.id}, ${S(b.device_model)}, ${S(b.revision)}, ${N(b.layer_count)}, ${S(b.primary_soc)}, ${S(b.pmic)}, ${S(b.notes)});`,
  );
  for (const c of b.components) {
    lines.push(`INSERT INTO board_components (board_revision_id, reference_designator, component_type, value, part_number, notes) VALUES (${b.id}, ${S(c.ref)}, ${S(c.type)}, ${S(c.value)}, ${S(c.pn)}, ${S(c.note)});`);
  }
  for (const t of b.testPoints) {
    lines.push(`INSERT INTO board_test_points (board_revision_id, label, location_desc, expected_voltage, expected_resistance) VALUES (${b.id}, ${S(t.label)}, ${S(t.location)}, ${S(t.v)}, ${S(t.r)});`);
  }
  for (const n of b.nets) {
    lines.push(`INSERT INTO board_nets (board_revision_id, net_name, test_point, expected_value, units) VALUES (${b.id}, ${S(n.name)}, ${S(n.tp)}, ${S(n.exp)}, ${S(n.units)});`);
  }
  for (const m of b.knownGood) {
    lines.push(`INSERT INTO measurements (board_revision_id, kind, test_point, reference_designator, rail_name, power_state, expected_value, measured_value, units, notes, is_known_good) VALUES (${b.id}, ${S(m.kind)}, ${S(m.tp)}, ${S(m.ref)}, ${S(m.rail)}, ${S(m.state)}, ${S(m.exp)}, ${S(m.meas)}, ${S(m.units)}, ${S(m.note)}, 1);`);
  }
  return lines;
}
const out4 = [];
out4.push("-- AUTO-GENERATED by scripts/seed-reference.mjs. Do not edit by hand.");
out4.push("-- Board revisions for every phone/tablet model (family-typical reference data).");
out4.push("");
for (const b of bulkBoards) {
  for (const line of boardStatements(b)) out4.push(line);
}
const sql4 = out4.join("\n");
writeFileSync(new URL("../src-tauri/src/db/seed_boards.sql", import.meta.url), sql4);

// Console board revisions -> own file.
const out5 = [];
out5.push("-- AUTO-GENERATED by scripts/seed-reference.mjs. Do not edit by hand.");
out5.push("-- Console board revisions (PlayStation, Xbox, Nintendo, Sega, and more).");
out5.push("");
for (const b of consoleBoards) {
  for (const line of boardStatements(b)) out5.push(line);
}
const sql5 = out5.join("\n");
writeFileSync(new URL("../src-tauri/src/db/seed_consoles.sql", import.meta.url), sql5);

// Per-device component-reference knowledge articles -> own file.
const out6 = [];
out6.push("-- AUTO-GENERATED by scripts/seed-reference.mjs. Do not edit by hand.");
out6.push("-- Knowledge base: a component-reference article for every device board.");
out6.push("");
for (let i = 0; i < deviceArticles.length; i += 50) {
  const chunk = deviceArticles.slice(i, i + 50);
  const values = chunk
    .map((a) => `(${S(a.title)}, ${S(a.category)}, ${S(a.html)}, ${S(a.text)})`)
    .join(",\n");
  out6.push(`INSERT INTO knowledge_articles (title, category, body_html, body_text) VALUES\n${values};`);
}
const sql6 = out6.join("\n");
writeFileSync(new URL("../src-tauri/src/db/seed_kb_devices.sql", import.meta.url), sql6);

console.log(`reference_parts: ${refRows.length}`);
console.log(`microcontrollers: ${mcuRows.length}`);
console.log(`raspberry_pi: ${rpiRows.length}`);
console.log(`curated board_revisions: ${BOARDS.length}`);
console.log(`bulk board_revisions: ${bulkBoards.length}`);
console.log(`console board_revisions: ${consoleBoards.length}`);
console.log(`device articles: ${deviceArticles.length}`);
console.log(`guide articles: ${ARTICLES.length}`);
console.log(`seed_boards bytes: ${sql4.length}, consoles: ${sql5.length}, kb_devices: ${sql6.length}`);
