/**
 * Square Web Payments SDK loader and card tokenization (runs in the webview).
 * The token it produces is sent to the Rust `square_create_payment` command,
 * which performs the actual charge with the backend-only access token.
 */
import { getSetting } from "@/lib/repos/settings";

interface SquareTokenResult {
  status: string;
  token?: string;
  errors?: { message: string }[];
}

export interface SquareCard {
  attach(selector: string): Promise<void>;
  tokenize(): Promise<SquareTokenResult>;
  destroy(): Promise<void>;
}

/** Subset of the Square Card style object (per-selector CSS-like properties). */
export type SquareCardStyle = Record<string, Record<string, string>>;

interface SquareCardOptions {
  style?: SquareCardStyle;
}

interface SquarePayments {
  card(options?: SquareCardOptions): Promise<SquareCard>;
}

interface SquareSdk {
  payments(appId: string, locationId: string): SquarePayments;
}

declare global {
  interface Window {
    Square?: SquareSdk;
  }
}

export interface SquareSettings {
  enabled: boolean;
  environment: "production" | "sandbox";
  applicationId: string;
  locationId: string;
  deviceId: string;
  currency: string;
}

export async function getSquareSettings(): Promise<SquareSettings> {
  const [enabled, environment, applicationId, locationId, deviceId, currency] = await Promise.all([
    getSetting<boolean>("square.enabled", false),
    getSetting<"production" | "sandbox">("square.environment", "production"),
    getSetting<string>("square.application_id", ""),
    getSetting<string>("square.location_id", ""),
    getSetting<string>("square.device_id", ""),
    getSetting<string>("square.currency", "USD"),
  ]);
  return { enabled, environment, applicationId, locationId, deviceId, currency };
}

let sdkPromise: Promise<SquareSdk> | null = null;

/** Load the Web Payments SDK script for the given environment (once). */
function loadSdk(environment: "production" | "sandbox"): Promise<SquareSdk> {
  if (window.Square) return Promise.resolve(window.Square);
  if (sdkPromise) return sdkPromise;

  const src =
    environment === "sandbox"
      ? "https://sandbox.web.squarecdn.com/v1/square.js"
      : "https://web.squarecdn.com/v1/square.js";

  sdkPromise = new Promise<SquareSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (window.Square) resolve(window.Square);
      else reject(new Error("Square SDK loaded but window.Square is missing"));
    };
    script.onerror = () => reject(new Error("Failed to load the Square Web Payments SDK"));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/** Initialise a Square card form and attach it to `selector`. */
export async function createCardForm(
  settings: SquareSettings,
  selector: string,
  style?: SquareCardStyle,
): Promise<SquareCard> {
  if (!settings.applicationId || !settings.locationId) {
    throw new Error("Square application id and location id are required (Settings > Payments).");
  }
  const sdk = await loadSdk(settings.environment);
  const payments = sdk.payments(settings.applicationId, settings.locationId);
  const card = await payments.card(style ? { style } : undefined);
  await card.attach(selector);
  return card;
}

/** Tokenize the entered card. Returns the payment token (source id). */
export async function tokenizeCard(card: SquareCard): Promise<string> {
  const result = await card.tokenize();
  if (result.status === "OK" && result.token) return result.token;
  const message = result.errors?.map((e) => e.message).join(", ") || "Card tokenization failed";
  throw new Error(message);
}
