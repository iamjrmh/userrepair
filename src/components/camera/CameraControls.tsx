import { Camera, Video, Square, FlipHorizontal2, FlipVertical2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraControlsProps {
  zoom: number;
  setZoom: (z: number) => void;
  flipH: boolean;
  toggleFlipH: () => void;
  flipV: boolean;
  toggleFlipV: () => void;
  ready?: boolean;
  recording?: boolean;
  onSnapshot?: () => void;
  onRecord?: () => void;
  /** Styled for a dark overlay background. */
  dark?: boolean;
}

/** Zoom / mirror / flip (and optional capture) controls, used by the toolbar and the fullscreen / pop-out overlay. */
export function CameraControls({
  zoom,
  setZoom,
  flipH,
  toggleFlipH,
  flipV,
  toggleFlipV,
  ready,
  recording,
  onSnapshot,
  onRecord,
  dark,
}: CameraControlsProps) {
  const labelCls = dark ? "text-white/80" : "text-muted-foreground";
  const toggleVariant = (on: boolean): "default" | "secondary" | "outline" =>
    on ? "default" : dark ? "secondary" : "outline";

  return (
    <div className="flex items-center gap-2">
      <span className={`w-10 text-xs tabular-nums ${labelCls}`}>{zoom.toFixed(1)}x</span>
      <input
        type="range"
        min={1}
        max={4}
        step={0.1}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="w-28 accent-primary"
        aria-label="Zoom"
      />
      <Button variant={toggleVariant(flipH)} size="sm" onClick={toggleFlipH} title="Mirror horizontally"><FlipHorizontal2 /></Button>
      <Button variant={toggleVariant(flipV)} size="sm" onClick={toggleFlipV} title="Flip vertically"><FlipVertical2 /></Button>
      {onSnapshot && <Button size="sm" onClick={onSnapshot} disabled={!ready}><Camera /> Photo</Button>}
      {onRecord && (
        <Button size="sm" variant={recording ? "destructive" : "default"} onClick={onRecord} disabled={!ready}>
          {recording ? (<><Square /> Stop</>) : (<><Video /> Record</>)}
        </Button>
      )}
    </div>
  );
}
