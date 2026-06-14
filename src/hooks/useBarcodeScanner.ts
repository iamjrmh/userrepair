import { useEffect } from "react";

/**
 * Listen for a USB barcode scanner (HID keyboard wedge). Scanners "type" the
 * code very fast and finish with Enter, so we buffer rapid keystrokes and emit
 * the code on Enter. Slow (human) typing resets the buffer, and keystrokes into
 * a focused input/textarea are left alone.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastTime = 0;

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      const now = Date.now();
      if (now - lastTime > 100) buffer = "";
      lastTime = now;

      if (e.key === "Enter") {
        if (buffer.length >= 3) onScan(buffer);
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onScan, enabled]);
}
