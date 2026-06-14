/**
 * Magnetic stripe (credit card) parsing for a generic 3-track USB reader such as
 * the MSR90. These readers act as a HID keyboard wedge: a swipe "types" the raw
 * track data and finishes with Enter, just like a barcode scanner.
 *
 * IMPORTANT (PCI): this parser derives only the card brand, last 4 digits,
 * expiration, and cardholder name, then discards the full card number. The full
 * PAN is never returned to callers, stored, or transmitted. userrepair records a
 * swiped card as a card tender; it does NOT send swiped card data to Square,
 * because Square's compliant flow requires its own encrypted reader/terminal or
 * its secure Web Payments form. Use the Square Terminal tender to charge a card
 * through Square.
 */

export interface SwipedCard {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  name: string | null;
  /** Whether the card number passed the Luhn checksum. */
  valid: boolean;
}

/** Detect whether a buffered HID string looks like magnetic stripe track data. */
export function looksLikeSwipe(raw: string): boolean {
  return /^%[A-Z]/.test(raw) || /^;\d/.test(raw) || (raw.includes("=") && /^\d*;?\d/.test(raw));
}

/** Brand from the issuer identification number (first digits of the PAN). */
function brandFromPan(pan: string): string {
  if (/^4/.test(pan)) return "Visa";
  if (/^(5[1-5])/.test(pan)) return "Mastercard";
  if (/^(222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(pan)) return "Mastercard";
  if (/^3[47]/.test(pan)) return "Amex";
  if (/^(6011|65|64[4-9])/.test(pan)) return "Discover";
  if (/^(36|38|30[0-5])/.test(pan)) return "Diners";
  if (/^35/.test(pan)) return "JCB";
  return "Card";
}

/** Standard Luhn checksum used by all major card networks. */
function luhnValid(pan: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let n = pan.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Convert a track-1 "SURNAME/FIRST" field into "First Surname". */
function formatName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const [surname, first] = trimmed.split("/");
  const name = [first, surname].map((p) => (p ? p.trim() : "")).filter(Boolean).join(" ");
  return name || null;
}

/**
 * Parse raw swipe data. Returns the safe, derived card summary, or null if the
 * data does not contain a recognizable track. The full PAN never leaves this
 * function.
 */
export function parseMagstripe(raw: string): SwipedCard | null {
  // Track 1: %B<PAN>^<NAME>^<YYMM>...?
  const t1 = raw.match(/%B(\d{12,19})\^([^^]*)\^(\d{2})(\d{2})/);
  if (t1) {
    const pan = t1[1] ?? "";
    return {
      brand: brandFromPan(pan),
      last4: pan.slice(-4),
      expYear: 2000 + Number(t1[3] ?? "0"),
      expMonth: Number(t1[4] ?? "0"),
      name: formatName(t1[2] ?? ""),
      valid: luhnValid(pan),
    };
  }
  // Track 2: ;<PAN>=<YYMM>...?
  const t2 = raw.match(/;?(\d{12,19})=(\d{2})(\d{2})/);
  if (t2) {
    const pan = t2[1] ?? "";
    return {
      brand: brandFromPan(pan),
      last4: pan.slice(-4),
      expYear: 2000 + Number(t2[2] ?? "0"),
      expMonth: Number(t2[3] ?? "0"),
      name: null,
      valid: luhnValid(pan),
    };
  }
  return null;
}
