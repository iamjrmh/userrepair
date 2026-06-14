import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  height?: number;
  displayValue?: boolean;
  className?: string;
}

/** Renders a CODE128 barcode (via JsBarcode) into an inline SVG. */
export function Barcode({ value, height = 50, displayValue = true, className }: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        displayValue,
        fontSize: 14,
        margin: 8,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // Ignore values JsBarcode cannot encode.
    }
  }, [value, height, displayValue]);

  return <svg ref={ref} className={className} />;
}
