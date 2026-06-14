import { useRef, useState } from "react";
import { Upload, Trash2, AlertTriangle, Microscope, ExternalLink } from "lucide-react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { CameraStage } from "@/components/camera/CameraStage";
import { CameraControls } from "@/components/camera/CameraControls";
import { getSetting } from "@/lib/repos/settings";
import { saveCapture } from "@/lib/camera";
import { attachFileToTicket } from "@/lib/repos/attachments";
import { listTickets } from "@/lib/repos/tickets";
import { isClient, hostSaveCapture, hostAttachToTicket } from "@/lib/net";

interface Capture {
  id: string;
  kind: "photo" | "video";
  url: string;
  path: string;
  fileName: string;
  blob: Blob;
}

const LS_DEVICE = "camera.device";
const LS_FLIP_H = "camera.flipH";
const LS_FLIP_V = "camera.flipV";

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export default function MicrosolderingPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>(() => localStorage.getItem(LS_DEVICE) ?? "");
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [flipH, setFlipH] = useState<boolean>(() => localStorage.getItem(LS_FLIP_H) === "1");
  const [flipV, setFlipV] = useState<boolean>(() => localStorage.getItem(LS_FLIP_V) === "1");
  const [recording, setRecording] = useState(false);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [outputDir, setOutputDir] = useState<string>("");
  const [uploadFor, setUploadFor] = useState<Capture | null>(null);

  useAsync(async () => {
    setOutputDir(await getSetting<string>("camera.output_dir", ""));
    return null;
  }, []);

  function pickDevice(id: string) {
    localStorage.setItem(LS_DEVICE, id);
    setDeviceId(id);
  }
  function toggleFlipH() {
    setFlipH((v) => { localStorage.setItem(LS_FLIP_H, v ? "0" : "1"); return !v; });
  }
  function toggleFlipV() {
    setFlipV((v) => { localStorage.setItem(LS_FLIP_V, v ? "0" : "1"); return !v; });
  }

  async function persist(blob: Blob, fileName: string, kind: "photo" | "video") {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      // On a client, send the capture to the host so it lands in the manager's
      // folder on the main PC; otherwise write to this machine's folder.
      const path = isClient()
        ? await hostSaveCapture(fileName, bytes)
        : await saveCapture(outputDir, fileName, bytes);
      const url = URL.createObjectURL(blob);
      setCaptures((c) => [
        { id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`, kind, url, path, fileName, blob },
        ...c,
      ]);
      toast.success(isClient() ? `Saved to the main PC: ${fileName}` : `Saved ${fileName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save capture");
    }
  }

  async function snapshot() {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (!outputDir) { toast.error("A manager needs to set the capture folder in Settings"); return; }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) { toast.error("Camera is still warming up"); return; }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Bake the current mirror/flip into the saved image so it matches the view.
    ctx.translate(flipH ? w : 0, flipV ? h : 0);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) { toast.error("Capture failed"); return; }
    await persist(blob, `snapshot-${stamp()}.png`, "photo");
  }

  function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;
    if (!outputDir) { toast.error("A manager needs to set the capture folder in Settings"); return; }
    chunksRef.current = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        toast.error("Recording is not supported here");
        return;
      }
    }
    rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      chunksRef.current = [];
      void persist(blob, `recording-${stamp()}.webm`, "video");
      setRecording(false);
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
  }

  function removeCapture(id: string) {
    setCaptures((list) => {
      const target = list.find((c) => c.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return list.filter((c) => c.id !== id);
    });
  }

  async function openPopout() {
    const params = new URLSearchParams({
      popout: "camera",
      device: deviceId,
      flipH: flipH ? "1" : "0",
      flipV: flipV ? "1" : "0",
    });
    try {
      const existing = await WebviewWindow.getByLabel("camera-popout");
      if (existing) { await existing.setFocus(); return; }
    } catch {
      // fall through and create a fresh window
    }
    const win = new WebviewWindow("camera-popout", {
      url: `index.html?${params.toString()}`,
      title: "Microscope - userrepair",
      width: 1000,
      height: 640,
    });
    win.once("tauri://error", () => toast.error("Could not open the pop-out window"));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Microsoldering"
        description="Live microscope feed. Zoom, pan, mirror, fullscreen, or pop out to another screen. Capture photos and clips to your local folder and upload them to a ticket."
      />

      {!outputDir && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <span>No capture folder is set. A manager can set one under Settings -&gt; Bench before snapshots and recordings can be saved.</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72 space-y-1.5">
          <Label>Camera</Label>
          <Combobox
            options={devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }))}
            value={deviceId || null}
            onChange={pickDevice}
            placeholder="Select a camera"
            searchPlaceholder="Search cameras..."
          />
        </div>
        <CameraControls
          zoom={zoom}
          setZoom={setZoom}
          flipH={flipH}
          toggleFlipH={toggleFlipH}
          flipV={flipV}
          toggleFlipV={toggleFlipV}
          ready={ready}
          recording={recording}
          onSnapshot={snapshot}
          onRecord={toggleRecord}
        />
      </div>

      <div style={{ aspectRatio: "16 / 10" }}>
        <CameraStage
          deviceId={deviceId}
          zoom={zoom}
          flipH={flipH}
          flipV={flipV}
          recording={recording}
          videoRef={videoRef}
          onStream={(s) => { streamRef.current = s; }}
          onDevices={setDevices}
          onActiveDevice={pickDevice}
          onReadyChange={setReady}
          extraButtons={
            <Button variant="secondary" size="icon-sm" onClick={openPopout} title="Pop out to a window" aria-label="Pop out to a window">
              <ExternalLink />
            </Button>
          }
          overlay={
            <CameraControls
              dark
              zoom={zoom}
              setZoom={setZoom}
              flipH={flipH}
              toggleFlipH={toggleFlipH}
              flipV={flipV}
              toggleFlipV={toggleFlipV}
              ready={ready}
              recording={recording}
              onSnapshot={snapshot}
              onRecord={toggleRecord}
            />
          }
        />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Microscope className="h-4 w-4" /> Captures this session
        </div>
        {captures.length === 0 ? (
          <p className="text-sm text-muted-foreground">Photos and clips you take are saved to your folder and listed here. Use Upload to attach one to a ticket.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {captures.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="aspect-video bg-black">
                  {c.kind === "photo" ? (
                    <img src={c.url} alt={c.fileName} className="h-full w-full object-contain" />
                  ) : (
                    <video src={c.url} controls className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="space-y-2 p-2">
                  <div className="truncate text-xs text-muted-foreground" title={c.fileName}>{c.fileName}</div>
                  <div className="flex items-center justify-between gap-1">
                    <Button variant="outline" size="sm" onClick={() => setUploadFor(c)}><Upload /> Upload</Button>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeCapture(c.id)} aria-label="Remove from list">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {uploadFor && (
        <UploadToTicketDialog capture={uploadFor} onClose={() => setUploadFor(null)} />
      )}
    </div>
  );
}

function UploadToTicketDialog({ capture, onClose }: { capture: Capture; onClose: () => void }) {
  const { data: tickets } = useAsync(listTickets, []);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!ticketId) { toast.error("Pick a ticket"); return; }
    setBusy(true);
    try {
      const category = capture.kind === "photo" ? "during" : "file";
      if (isClient()) {
        // Send the bytes to the host so the file lives where the shared row points.
        const bytes = new Uint8Array(await capture.blob.arrayBuffer());
        await hostAttachToTicket(Number(ticketId), capture.fileName, category, bytes);
      } else {
        await attachFileToTicket(Number(ticketId), capture.path, capture.fileName, category);
      }
      toast.success("Uploaded to ticket");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload to ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="truncate text-sm text-muted-foreground">{capture.fileName}</p>
          <div className="space-y-1.5">
            <Label>Ticket</Label>
            <Combobox
              options={(tickets ?? []).map((t) => ({
                value: String(t.id),
                label: `${t.ticket_number} - ${t.title}`,
                hint: t.customer_name ?? undefined,
              }))}
              value={ticketId}
              onChange={setTicketId}
              placeholder="Select a ticket"
              searchPlaceholder="Search tickets..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={upload} disabled={busy || !ticketId}>{busy ? "Uploading..." : "Upload"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
