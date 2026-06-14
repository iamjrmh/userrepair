import { useEffect, useRef, useState } from "react";
import { Printer, Image as ImageIcon, FileText } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  loadShopInfo,
  buildReceiptHtml,
  printReceiptHtml,
  type ReceiptPayload,
  type ReceiptWidth,
} from "@/lib/receipt";
import { saveCapture } from "@/lib/camera";

/**
 * A custom, in-app receipt preview. Shows exactly how the receipt prints on
 * 58mm or 80mm paper, then sends it to the printer or saves it as a PNG / PDF,
 * with no reliance on the browser's print preview.
 */
export function ReceiptPreviewDialog({
  payload,
  open,
  onClose,
  initialWidth = 80,
}: {
  payload: ReceiptPayload;
  open: boolean;
  onClose: () => void;
  initialWidth?: ReceiptWidth;
}) {
  const [width, setWidth] = useState<ReceiptWidth>(initialWidth);
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => { setWidth(initialWidth); }, [initialWidth, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      const shop = await loadShopInfo(width);
      if (active) setHtml(buildReceiptHtml(payload, shop));
    })();
    return () => { active = false; };
  }, [open, width, payload]);

  // Size the preview iframe to its content so the whole receipt shows.
  function fitHeight() {
    const f = frameRef.current;
    const doc = f?.contentDocument;
    if (f && doc?.body) f.style.height = `${doc.body.scrollHeight}px`;
  }

  async function capture(): Promise<HTMLCanvasElement | null> {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return null;
    return html2canvas(doc.body, { backgroundColor: "#ffffff", scale: 3 });
  }

  async function saveBytes(defaultName: string, ext: string, bytes: Uint8Array) {
    const path = await save({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return;
    const dir = path.replace(/[\\/][^\\/]*$/, "");
    const name = path.split(/[\\/]/).pop() ?? defaultName;
    await saveCapture(dir, name, bytes);
    toast.success(`Saved ${name}`);
  }

  async function onPrint() {
    setBusy(true);
    try {
      await printReceiptHtml(html);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not print");
    } finally {
      setBusy(false);
    }
  }

  async function onSavePng() {
    setBusy(true);
    try {
      const canvas = await capture();
      if (!canvas) return;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) { toast.error("Could not render the image"); return; }
      await saveBytes(`receipt-${width}mm.png`, "png", new Uint8Array(await blob.arrayBuffer()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save PNG");
    } finally {
      setBusy(false);
    }
  }

  async function onSavePdf() {
    setBusy(true);
    try {
      const canvas = await capture();
      if (!canvas) return;
      const heightMm = (width * canvas.height) / canvas.width;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [width, heightMm] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, heightMm);
      const buf = pdf.output("arraybuffer") as ArrayBuffer;
      await saveBytes(`receipt-${width}mm.pdf`, "pdf", new Uint8Array(buf));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Test receipt</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2">
          <Button variant={width === 58 ? "default" : "outline"} size="sm" onClick={() => setWidth(58)}>58 mm</Button>
          <Button variant={width === 80 ? "default" : "outline"} size="sm" onClick={() => setWidth(80)}>80 mm</Button>
        </div>

        <div className="flex max-h-[58vh] justify-center overflow-auto rounded-lg bg-muted/40 p-4">
          <iframe
            ref={frameRef}
            title="Receipt preview"
            srcDoc={html}
            onLoad={fitHeight}
            scrolling="no"
            style={{ width: `${width}mm`, border: "none", background: "#fff", boxShadow: "0 1px 10px rgba(0,0,0,0.2)" }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void onSavePng()} disabled={busy}><ImageIcon /> Save PNG</Button>
          <Button variant="outline" onClick={() => void onSavePdf()} disabled={busy}><FileText /> Save PDF</Button>
          <Button onClick={() => void onPrint()} disabled={busy}><Printer /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
