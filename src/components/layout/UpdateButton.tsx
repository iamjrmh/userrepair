import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/update";

/**
 * Top-bar update control: a simple refresh icon that opens the update dialog,
 * with a small dot when a newer release is waiting. No auto-update - clicking is
 * always the owner's choice.
 */
export function UpdateButton() {
  const openDialog = useUpdateStore((s) => s.openDialog);
  const available = useUpdateStore((s) => s.info?.available ?? false);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={available ? "Update available" : "Check for updates"}
      title={available ? "Update available" : "Check for updates"}
      onClick={openDialog}
    >
      <RefreshCw />
      {available && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
      )}
    </Button>
  );
}
