// Generates a 1024x1024 RGBA PNG brand icon (a stylised IC "chip") with no
// external dependencies, then `npm run tauri icon` expands it into the full set.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const buf = new Uint8Array(SIZE * SIZE * 4);

const BG = [10, 15, 30];
const CHIP_TOP = [59, 130, 246]; // #3B82F6
const CHIP_BOT = [30, 64, 175]; // #1E40AF
const AMBER = [217, 119, 6]; // #D97706
const NOTCH = [15, 23, 42];

function set(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function fillRect(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, color);
}

function inRoundRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Background
fillRect(0, 0, SIZE, SIZE, BG);

// Pins (amber) around the chip body
const pinLen = 70;
const pinW = 46;
const gap = 150;
for (let k = 0; k < 4; k++) {
  const off = 312 + k * gap;
  fillRect(off, 150, pinW, pinLen, AMBER); // top
  fillRect(off, SIZE - 150 - pinLen, pinW, pinLen, AMBER); // bottom
  fillRect(150, off, pinLen, pinW, AMBER); // left
  fillRect(SIZE - 150 - pinLen, off, pinLen, pinW, AMBER); // right
}

// Chip body with vertical gradient
const bx = 232;
const by = 232;
const bw = SIZE - bx * 2;
const bh = SIZE - by * 2;
const radius = 120;
for (let y = by; y < by + bh; y++) {
  const t = (y - by) / bh;
  const col = [
    Math.round(CHIP_TOP[0] + (CHIP_BOT[0] - CHIP_TOP[0]) * t),
    Math.round(CHIP_TOP[1] + (CHIP_BOT[1] - CHIP_TOP[1]) * t),
    Math.round(CHIP_TOP[2] + (CHIP_BOT[2] - CHIP_TOP[2]) * t),
  ];
  for (let x = bx; x < bx + bw; x++) {
    if (inRoundRect(x, y, bx, by, bw, bh, radius)) set(x, y, col);
  }
}

// Pin-1 notch (top-left corner indicator) + inner die square
fillRect(bx + 70, by + 70, 90, 90, NOTCH);
const ix = 392;
const iw = SIZE - ix * 2;
for (let y = ix; y < ix + iw; y++)
  for (let x = ix; x < ix + iw; x++)
    if (inRoundRect(x, y, ix, ix, iw, iw, 50)) set(x, y, NOTCH);

// Encode PNG (truecolour + alpha, 8-bit)
function crc32(data) {
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  buf.subarray(y * SIZE * 4, (y + 1) * SIZE * 4).forEach((v, i) => {
    raw[y * (SIZE * 4 + 1) + 1 + i] = v;
  });
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../app-icon.png", import.meta.url), png);
console.log("wrote app-icon.png", png.length, "bytes");
