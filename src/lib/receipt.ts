/**
 * Local receipt generation and printing.
 *
 * The shop's own receipt is rendered as a self-contained HTML document sized to
 * the configured thermal paper width (58mm or 80mm) and printed through a hidden
 * iframe. This works with any generic USB / thermal receipt printer installed as
 * a Windows printer, and the same print dialog can "Save as PDF". No cloud and no
 * dependency on Square's hosted receipt.
 */
import JsBarcode from "jsbarcode";
import { getSetting } from "@/lib/repos/settings";
import { useBrandStore } from "@/stores/brand";
import { formatCents } from "@/lib/format";

export type ReceiptWidth = 58 | 80;

export interface ReceiptTender {
  method: string;
  amount_cents: number;
  last4?: string;
  change_cents?: number;
  receipt_url?: string;
}

export interface ReceiptPayload {
  number: string;
  dateIso: string;
  lines: { description: string; quantity: number; unit_price_cents: number }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  tenders: ReceiptTender[];
  earnedPoints: number;
  pointsBalance?: number | null;
  customerName?: string | null;
}

export interface ShopInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  logo: string;
  footer: string;
  width: ReceiptWidth;
}

const TENDER_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  terminal: "Card (Terminal)",
  rewards: "Points",
};

/** Read the configured receipt width (defaults to 80mm). */
export async function getReceiptWidth(): Promise<ReceiptWidth> {
  const w = await getSetting<number>("pos.receipt_width_mm", 80);
  return w === 58 ? 58 : 80;
}

/** Load shop info for a receipt, optionally forcing a paper width for preview. */
export async function loadShopInfo(widthOverride?: ReceiptWidth): Promise<ShopInfo> {
  const [name, address, phone, email, footer, width] = await Promise.all([
    getSetting<string>("shop.name", ""),
    getSetting<string>("shop.address", ""),
    getSetting<string>("shop.phone", ""),
    getSetting<string>("shop.email", ""),
    getSetting<string>("pos.receipt_footer", "Thank you for your business!"),
    getReceiptWidth(),
  ]);
  return {
    name: name || "Receipt",
    address,
    phone,
    email,
    logo: useBrandStore.getState().logo,
    footer,
    width: widthOverride ?? width,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render the sale number as a scannable CODE128 barcode data URL. */
function barcodeDataUrl(value: string, widthMm: ReceiptWidth): string {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format: "CODE128",
      width: widthMm === 58 ? 1.5 : 2,
      height: 38,
      displayValue: false,
      margin: 0,
      background: "#ffffff",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/** Make an asset/logo URL absolute so it resolves inside the print iframe. */
function absoluteUrl(src: string): string {
  if (!src) return "";
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Build the complete, self-contained receipt HTML document. */
export function buildReceiptHtml(payload: ReceiptPayload, shop: ShopInfo): string {
  const w = shop.width;
  const pad = w === 58 ? 3 : 5;
  const baseFont = w === 58 ? 11 : 12;
  const totalChange = payload.tenders.reduce((s, t) => s + (t.change_cents ?? 0), 0);
  const logo = absoluteUrl(shop.logo);
  const barcode = barcodeDataUrl(payload.number, w);

  const lineRows = payload.lines
    .map((l) => {
      const lineTotal = Math.round(l.quantity * l.unit_price_cents);
      const qtyNote =
        l.quantity !== 1 || l.unit_price_cents !== lineTotal
          ? `<div class="muted small">${l.quantity} &times; ${formatCents(l.unit_price_cents)}</div>`
          : "";
      return `<div class="row item">
        <div class="desc">${escapeHtml(l.description)}${qtyNote}</div>
        <div class="amt">${formatCents(lineTotal)}</div>
      </div>`;
    })
    .join("");

  const totalRow = (label: string, value: string, cls = "") =>
    `<div class="row ${cls}"><div>${label}</div><div class="amt">${value}</div></div>`;

  const tenderRows = payload.tenders
    .map((t) => {
      const label = TENDER_LABEL[t.method] ?? t.method;
      const suffix = t.last4 ? ` ****${t.last4}` : "";
      return totalRow(`${escapeHtml(label)}${suffix}`, formatCents(t.amount_cents));
    })
    .join("");

  const contactLines = [shop.address, shop.phone, shop.email]
    .filter((s) => s.trim() !== "")
    .map((s) => `<div class="muted small">${escapeHtml(s)}</div>`)
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<base href="${window.location.href}" />
<style>
  @page { size: ${w}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${w}mm;
    padding: ${pad}mm;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: ${baseFont}px;
    line-height: 1.4;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .muted { color: #444; }
  .small { font-size: ${baseFont - 2}px; }
  .logo { max-width: ${w === 58 ? 30 : 40}mm; max-height: 22mm; margin: 0 auto 4px; display: block; object-fit: contain; }
  .shop { font-weight: 700; font-size: ${baseFont + 3}px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row.item { margin-bottom: 3px; }
  .desc { flex: 1; word-break: break-word; }
  .amt { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
  .total { font-weight: 700; font-size: ${baseFont + 4}px; margin-top: 2px; }
  .meta { font-size: ${baseFont - 1}px; }
  .barcode { margin-top: 8px; text-align: center; }
  .barcode img { max-width: 100%; }
  .footer { margin-top: 8px; text-align: center; font-weight: 600; }
</style>
</head>
<body>
  <div class="center">
    ${logo ? `<img class="logo" src="${logo}" alt="logo" />` : ""}
    <div class="shop">${escapeHtml(shop.name)}</div>
    ${contactLines}
  </div>
  <div class="divider"></div>
  <div class="meta">
    <div class="row"><div>Receipt</div><div>${escapeHtml(payload.number)}</div></div>
    <div class="row"><div>Date</div><div>${escapeHtml(formatDate(payload.dateIso))}</div></div>
    ${payload.customerName ? `<div class="row"><div>Customer</div><div>${escapeHtml(payload.customerName)}</div></div>` : ""}
  </div>
  <div class="divider"></div>
  ${lineRows}
  <div class="divider"></div>
  ${totalRow("Subtotal", formatCents(payload.subtotalCents))}
  ${payload.discountCents > 0 ? totalRow("Discount", `-${formatCents(payload.discountCents)}`) : ""}
  ${totalRow("Tax", formatCents(payload.taxCents))}
  ${totalRow("Total", formatCents(payload.totalCents), "total")}
  <div class="divider"></div>
  ${tenderRows}
  ${totalChange > 0 ? totalRow("Change", formatCents(totalChange)) : ""}
  ${
    payload.earnedPoints > 0
      ? `<div class="divider"></div><div class="center small">Earned ${payload.earnedPoints} point${payload.earnedPoints === 1 ? "" : "s"}${
          typeof payload.pointsBalance === "number" ? ` &middot; Balance ${payload.pointsBalance}` : ""
        }</div>`
      : ""
  }
  ${barcode ? `<div class="barcode"><img src="${barcode}" alt="${escapeHtml(payload.number)}" /><div class="small muted">${escapeHtml(payload.number)}</div></div>` : ""}
  ${shop.footer.trim() !== "" ? `<div class="footer">${escapeHtml(shop.footer)}</div>` : ""}
</body>
</html>`;
}

/**
 * Print a receipt to the default / chosen printer via a hidden iframe. The user
 * picks their thermal printer in the print dialog.
 */
export async function printReceipt(payload: ReceiptPayload, widthOverride?: ReceiptWidth): Promise<void> {
  const shop = await loadShopInfo(widthOverride);
  await printReceiptHtml(buildReceiptHtml(payload, shop));
}

/** Print a pre-built receipt HTML document through a hidden iframe. */
export async function printReceiptHtml(html: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.srcdoc = html;

  await new Promise<void>((resolve) => {
    iframe.onload = () => {
      // Give embedded images (logo, barcode) a moment to decode before printing.
      window.setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          window.setTimeout(() => iframe.remove(), 1000);
          resolve();
        }
      }, 200);
    };
    document.body.appendChild(iframe);
  });
}

/** A sample receipt used by the "Print test receipt" button in settings. */
export function sampleReceipt(): ReceiptPayload {
  return {
    number: "POS-00042",
    dateIso: new Date().toISOString(),
    lines: [
      { description: "iPhone 12 screen replacement", quantity: 1, unit_price_cents: 12900 },
      { description: "Labor", quantity: 1.5, unit_price_cents: 6000 },
      { description: "Tempered glass protector", quantity: 2, unit_price_cents: 999 },
    ],
    subtotalCents: 23898,
    discountCents: 1000,
    taxCents: 1832,
    totalCents: 24730,
    tenders: [{ method: "cash", amount_cents: 30000, change_cents: 5270 }],
    earnedPoints: 247,
    pointsBalance: 512,
    customerName: "Sample Customer",
  };
}
