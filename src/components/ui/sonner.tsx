import { Toaster as SonnerToaster, toast } from "sonner";
import { useThemeStore } from "@/stores/theme";

/** App-wide toast host. Mirrors the active theme so toasts match the shell. */
export function Toaster() {
  const mode = useThemeStore((s) => s.resolved);
  return (
    <SonnerToaster
      theme={mode}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "font-sans",
        },
      }}
    />
  );
}

export { toast };
