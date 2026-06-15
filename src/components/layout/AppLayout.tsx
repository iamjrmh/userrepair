import { Suspense, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { UpdateDialog } from "@/components/layout/UpdateDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useSyncMonitor } from "@/hooks/useSyncMonitor";
import { useOutboxFlusher } from "@/hooks/useOutboxFlusher";
import { useUpdateStore } from "@/stores/update";

function RouteFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function AppLayout() {
  useSyncMonitor();
  useOutboxFlusher();

  // Check for an update once, when the app opens, and pop the dialog open right
  // away if one is available. No background polling: nothing appears mid-task.
  useEffect(() => {
    void useUpdateStore.getState().check(true);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-hidden">
          <div className="h-full overflow-auto p-6">
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <CommandPalette />
      <UpdateDialog />
    </div>
  );
}
