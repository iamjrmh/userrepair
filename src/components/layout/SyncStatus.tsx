import { Wifi, WifiOff, Server } from "lucide-react";
import { useSyncStore } from "@/lib/sync";
import { getNetMode } from "@/lib/net";

type Tone = "green" | "amber";

function Pill({
  tone,
  icon: Icon,
  label,
  title,
  pulse,
}: {
  tone: Tone;
  icon: typeof Wifi;
  label: string;
  title: string;
  pulse?: boolean;
}) {
  const tones: Record<Tone, string> = {
    green: "border-success/40 bg-success/10 text-success",
    amber: "border-warning/40 bg-warning/10 text-warning",
  };
  return (
    <span
      title={title}
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${tones[tone]}`}
    >
      <Icon className={`h-3.5 w-3.5 ${pulse ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

/**
 * Compact connection indicator shown in the top bar. Standalone shops see
 * nothing unless the internet drops (which only affects card payments).
 */
export function SyncStatus() {
  const online = useSyncStore((s) => s.online);
  const internet = useSyncStore((s) => s.internet);
  const mode = getNetMode() ?? "standalone";

  if (mode === "standalone") {
    return internet ? null : (
      <Pill tone="amber" icon={WifiOff} label="No internet" title="The internet is down. Card payments are paused; cash and other tenders still work." />
    );
  }

  if (mode === "host") {
    return <Pill tone="green" icon={Server} label="Hosting" title="This is the main PC. Other PCs on the network sync to it." />;
  }

  // client
  return online ? (
    <Pill tone="green" icon={Wifi} label="Synced" title="Connected to the main PC. All PCs are kept up to date." />
  ) : (
    <Pill tone="amber" icon={WifiOff} label="Reconnecting" pulse title="Lost the main PC. Retrying automatically; everything resyncs the moment it returns." />
  );
}
