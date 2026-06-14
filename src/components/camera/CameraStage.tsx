import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Maximize, Minimize, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraStageProps {
  deviceId: string;
  zoom: number;
  flipH: boolean;
  flipV: boolean;
  recording?: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  onStream?: (stream: MediaStream | null) => void;
  onDevices?: (devices: MediaDeviceInfo[]) => void;
  onActiveDevice?: (id: string) => void;
  onReadyChange?: (ready: boolean) => void;
  /** Quick controls shown over the feed, auto-hidden after idle. */
  overlay?: ReactNode;
  /** Extra persistent buttons in the top-right (e.g. pop out). */
  extraButtons?: ReactNode;
  /** Show the overlay controls even when not fullscreen (used by the pop-out). */
  alwaysShowOverlay?: boolean;
}

const IDLE_HIDE_MS = 5000;

/**
 * The live camera surface: owns the MediaStream for a device, applies digital
 * zoom with drag-to-pan and mirror/flip, and supports fullscreen with overlay
 * controls that fade out after 5s of no mouse movement.
 */
export function CameraStage({
  deviceId,
  zoom,
  flipH,
  flipV,
  recording,
  videoRef,
  onStream,
  onDevices,
  onActiveDevice,
  onReadyChange,
  overlay,
  extraButtons,
  alwaysShowOverlay,
}: CameraStageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const hideTimer = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const start = useCallback(async () => {
    setError(null);
    setReady(false);
    onReadyChange?.(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onStream?.(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      streamRef.current = stream;
      onStream?.(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setReady(true);
      onReadyChange?.(true);
      const all = await navigator.mediaDevices.enumerateDevices();
      onDevices?.(all.filter((d) => d.kind === "videoinput"));
      if (!deviceId) {
        const active = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (active) onActiveDevice?.(active);
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Could not open the camera. Check it is plugged in and camera access is allowed.";
      setError(msg);
      setReady(false);
      onReadyChange?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  useEffect(() => {
    void start();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [start]);

  // Reset pan when there is nothing to pan or the camera changed.
  useEffect(() => { if (zoom <= 1) setPan({ x: 0, y: 0 }); }, [zoom]);
  useEffect(() => { setPan({ x: 0, y: 0 }); }, [deviceId]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), IDLE_HIDE_MS);
  }, []);

  // Kick off the idle timer when the overlay first becomes relevant.
  useEffect(() => { if (alwaysShowOverlay) revealControls(); }, [alwaysShowOverlay, revealControls]);
  useEffect(() => { if (isFullscreen) revealControls(); }, [isFullscreen, revealControls]);

  function clampPan(p: { x: number; y: number }): { x: number; y: number } {
    const el = wrapRef.current;
    if (!el) return p;
    const maxX = (el.clientWidth * (zoom - 1)) / 2;
    const maxY = (el.clientHeight * (zoom - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, p.x)),
      y: Math.max(-maxY, Math.min(maxY, p.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (zoom <= 1) return;
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    revealControls();
    if (!dragRef.current) return;
    setPan(clampPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y }));
  }
  function onPointerUp() {
    dragRef.current = null;
    setDragging(false);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be refused; nothing to recover.
    }
  }

  const sx = flipH ? -zoom : zoom;
  const sy = flipV ? -zoom : zoom;
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${sx}, ${sy})`;
  const canPan = zoom > 1;
  // When the overlay is in play (fullscreen or pop-out) the corner buttons fade
  // out with it; in the normal inline view they stay put.
  const overlayActive = isFullscreen || Boolean(alwaysShowOverlay);
  const chromeVisible = !overlayActive || controlsVisible;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-black"
      onPointerMove={onPointerMove}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className={`absolute inset-0 h-full w-full object-contain ${dragging ? "" : "transition-transform duration-100"} ${canPan ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
        style={{ transform }}
      />

      {recording && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-destructive/90 px-2.5 py-1 text-xs font-medium text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
        </div>
      )}

      <div className={`absolute right-2 top-2 flex items-center gap-1 transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0"}`}>
        {extraButtons}
        <Button variant="secondary" size="icon-sm" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {isFullscreen ? <Minimize /> : <Maximize />}
        </Button>
      </div>

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/80">
          <AlertTriangle className="h-6 w-6 text-warning" />
          <p className="max-w-md">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void start()}>Try again</Button>
        </div>
      )}
      {!error && !ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Starting camera...</div>
      )}

      {overlay && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 transition-opacity duration-200 ${overlayActive && controlsVisible ? "opacity-100" : "opacity-0"}`}
        >
          <div className={`flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-3 py-2 backdrop-blur ${overlayActive && controlsVisible ? "pointer-events-auto" : "pointer-events-none"}`}>
            {overlay}
          </div>
        </div>
      )}
    </div>
  );
}
