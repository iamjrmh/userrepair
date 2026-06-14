import { useRef, useState } from "react";
import { CameraStage } from "@/components/camera/CameraStage";
import { CameraControls } from "@/components/camera/CameraControls";

/**
 * The popped-out microscope view. Runs in its own borderless app window so it
 * can be dragged to another monitor and fullscreened. It opens its own camera
 * stream (device passed in the URL) and offers zoom, pan, mirror, flip, and
 * fullscreen, but not capture - photos and clips stay in the main window.
 */
export default function CameraPopout() {
  const params = new URLSearchParams(window.location.search);
  const device = params.get("device") ?? "";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [zoom, setZoom] = useState(1);
  const [flipH, setFlipH] = useState(params.get("flipH") === "1");
  const [flipV, setFlipV] = useState(params.get("flipV") === "1");

  return (
    <div className="h-screen w-screen bg-black">
      <CameraStage
        deviceId={device}
        zoom={zoom}
        flipH={flipH}
        flipV={flipV}
        videoRef={videoRef}
        alwaysShowOverlay
        overlay={
          <CameraControls
            dark
            zoom={zoom}
            setZoom={setZoom}
            flipH={flipH}
            toggleFlipH={() => setFlipH((v) => !v)}
            flipV={flipV}
            toggleFlipV={() => setFlipV((v) => !v)}
          />
        }
      />
    </div>
  );
}
