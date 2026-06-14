import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

/**
 * Money helpers. All monetary values are integer cents in the database and in
 * memory. Formatting to a human string happens only here, at the view layer.
 */
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Parse a user-entered dollar string into integer cents. Returns 0 on garbage. */
export function dollarsToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, "");
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Render integer cents as a plain editable dollar string ("12.50"). */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Basis points (825) -> percent label ("8.25%"). */
export function formatBasisPoints(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}

/** Format an ISO timestamp as a short local date-time, or "-" if absent. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "yyyy-MM-dd HH:mm") : "-";
}

/** Format an ISO date as a short date, or "-" if absent. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "yyyy-MM-dd") : "-";
}

/** Relative "3 hours ago" style label. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = parseISO(iso);
  return isValid(d) ? `${formatDistanceToNow(d)} ago` : "-";
}

/** Format a byte count as a human-readable size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** Format a duration in seconds as "1h 23m" / "5m 02s". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/**
 * Validate an IMEI using the Luhn checksum. Accepts a 15-digit string.
 */
export function isValidImei(imei: string): boolean {
  const digits = imei.replace(/\D/g, "");
  if (digits.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let n = Number(digits[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}
