import { RefreshCw, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/update";

/**
 * The update dialog, opened from the top-bar button. Shows the current vs latest
 * version, release notes, and an explicit Install action. Downloading and
 * installing only happen when the owner clicks Install.
 */
export function UpdateDialog() {
  const dialogOpen = useUpdateStore((s) => s.dialogOpen);
  const closeDialog = useUpdateStore((s) => s.closeDialog);
  const checking = useUpdateStore((s) => s.checking);
  const installing = useUpdateStore((s) => s.installing);
  const info = useUpdateStore((s) => s.info);
  const error = useUpdateStore((s) => s.error);
  const check = useUpdateStore((s) => s.check);
  const install = useUpdateStore((s) => s.install);

  const available = info?.available ?? false;

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && !installing) closeDialog(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Software update</DialogTitle>
          <DialogDescription>
            {info ? `You are running version ${info.current}.` : "Comparing your version with the latest release."}
          </DialogDescription>
        </DialogHeader>

        {checking && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Checking for updates...
          </div>
        )}

        {!checking && error && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>Could not check for updates right now. {error}</span>
          </div>
        )}

        {!checking && !error && info && available && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Download className="h-4 w-4 text-primary" /> Version {info.latest} is available.
            </div>
            {info.notes && (
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {info.notes}
              </div>
            )}
            {installing && (
              <p className="text-xs text-muted-foreground">
                Downloading and installing the update. userrepair will close while it installs, then you can reopen it. Finish any sale or ticket first.
              </p>
            )}
          </div>
        )}

        {!checking && !error && info && !available && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" /> You are on the latest version.
          </div>
        )}

        <DialogFooter>
          {available ? (
            <>
              <Button variant="outline" onClick={closeDialog} disabled={installing}>Later</Button>
              <Button onClick={() => void install()} disabled={installing}>
                {installing ? "Installing..." : (<><Download className="h-4 w-4" /> Install update</>)}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => void check()} disabled={checking}>Check again</Button>
              <Button onClick={closeDialog}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
