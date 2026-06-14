import React from "react";
import ReactDOM from "react-dom/client";

// Bundled fonts (offline-first: no Google Fonts CDN at runtime).
import "@fontsource/fira-sans/300.css";
import "@fontsource/fira-sans/400.css";
import "@fontsource/fira-sans/500.css";
import "@fontsource/fira-sans/600.css";
import "@fontsource/fira-sans/700.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";

import "@/index.css";
import App from "@/App";
import CameraPopout from "@/routes/CameraPopout";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { useThemeStore } from "@/stores/theme";

// The pop-out camera window loads this same bundle with ?popout=camera; render
// just the camera there, outside the normal app shell, auth, and router.
const isCameraPopout = new URLSearchParams(window.location.search).get("popout") === "camera";

// Apply the saved theme before first paint.
useThemeStore.getState().init();

// Disable the default browser context menu app-wide; a custom one will be added
// where needed.
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isCameraPopout ? <CameraPopout /> : <App />}
      <Toaster />
    </ErrorBoundary>
  </React.StrictMode>,
);
