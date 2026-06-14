import { useEffect } from "react";
import { parseMagstripe, looksLikeSwipe, type SwipedCard } from "@/lib/magstripe";

/**
 * Listen for a generic 3-track USB magnetic card reader (e.g. MSR90). Like a
 * barcode scanner it is a HID keyboard wedge: it "types" the raw track data fast
 * and finishes with Enter. We buffer rapid keystrokes, and once a swipe (which
 * starts with a track sentinel like `%` or `;`) completes, we parse it and emit
 * the safe card summary. Keystrokes into a focused input are left alone.
 *
 * The barcode scanner hook also sees these keystrokes; guard its handler by
 * ignoring codes that start with a magstripe sentinel (see POSPage handleScan).
 */
export function useCardSwipe(onSwipe: (card: SwipedCard) => void, enabled = true) {
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
        if (looksLikeSwipe(buffer)) {
          const card = parseMagstripe(buffer);
          if (card) onSwipe(card);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSwipe, enabled]);
}
