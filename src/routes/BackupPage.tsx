import { useState } from "react";
import { DatabaseBackup, Download, Upload, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { runBackup, restoreBackup, backupHistory } from "@/lib/repos/backup";
import { formatBytes, formatDateTime } from "@/lib/format";

export default function BackupPage() {
  const { data, reload } = useAsync(() => backupHistory(10), []);
  const [busy, setBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  async function doBackup() {
    setBusy(true);
    try {
      const result = await runBackup();
      if (result) {
        toast.success(`Backup written (${result.file_count} files, ${formatBytes(result.size)})`);
        reload();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    try {
      const restored = await restoreBackup();
      if (restored !== null) {
        toast.success(`Restored ${restored} files. Restart to load the restored database.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Backup & Restore" description="Archive the database and attachments as a single ZIP." />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-4 w-4" /> Create backup</CardTitle><CardDescription>Exports the SQLite database plus the attachments folder.</CardDescription></CardHeader>
          <CardContent><Button onClick={doBackup} disabled={busy}><DatabaseBackup /> Back up now</Button></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Restore backup</CardTitle><CardDescription>Replaces the current database and attachments. This cannot be undone.</CardDescription></CardHeader>
          <CardContent><Button variant="destructive" onClick={() => setConfirmRestore(true)}><RotateCcw /> Restore from ZIP</Button></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent backups</CardTitle></CardHeader>
        <CardContent>
          {(data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No backups recorded yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {(data ?? []).map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate font-mono text-xs">{b.path}</span>
                  <span className="shrink-0 pl-3 text-muted-foreground">{formatBytes(b.size_bytes)} - {b.file_count} files - {formatDateTime(b.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title="Restore from backup?"
        description="This replaces the current database and attachments with the archive contents. The app should be restarted afterward."
        confirmLabel="Choose ZIP and restore"
        destructive
        onConfirm={doRestore}
      />
    </div>
  );
}
