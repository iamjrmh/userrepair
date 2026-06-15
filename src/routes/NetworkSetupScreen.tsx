import { useState } from "react";
import { Monitor, Server, Network, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import {
  setNetConfig,
  startHostServer,
  checkHost,
  getLanIp,
  DEFAULT_PORT,
  type NetMode,
} from "@/lib/net";

/**
 * First-run network choice. Runs before the owner setup / login flow so a fresh
 * install knows whether it owns the data (standalone / host) or connects to
 * another PC (client). The choice is stored per-machine in localStorage.
 */
export default function NetworkSetupScreen({ onDone }: { onDone: (mode: NetMode) => void }) {
  const [step, setStep] = useState<"choose" | "host" | "client">("choose");

  if (step === "host") return <HostSetup onBack={() => setStep("choose")} onDone={() => onDone("host")} />;
  if (step === "client") return <ClientSetup onBack={() => setStep("choose")} onDone={() => onDone("client")} />;

  function chooseStandalone() {
    setNetConfig({ mode: "standalone" });
    // Start the inbound-only server now so the Inbox webhook works without a restart.
    void startHostServer(DEFAULT_PORT, "", false).catch(() => undefined);
    onDone("standalone");
  }

  return (
    <Shell title="Set up userrepair" subtitle="How many computers will run userrepair in your shop?">
      <div className="grid gap-3">
        <Choice
          icon={<Monitor className="h-5 w-5" />}
          title="Just this PC"
          desc="A single computer. All data stays on this machine. You can connect more PCs later."
          onClick={chooseStandalone}
        />
        <Choice
          icon={<Server className="h-5 w-5" />}
          title="This is the main PC"
          desc="This computer holds the shop's data and lets other PCs connect to it. Pick this on the owner's machine."
          onClick={() => setStep("host")}
        />
        <Choice
          icon={<Network className="h-5 w-5" />}
          title="Connect to the main PC"
          desc="This computer joins a shop that is already set up on another PC. You will need that PC's address."
          onClick={() => setStep("client")}
        />
      </div>
    </Shell>
  );
}

function HostSetup({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { data: lanIp } = useAsync(getLanIp, []);
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    const portNum = Number(port) || DEFAULT_PORT;
    setBusy(true);
    try {
      setNetConfig({ mode: "host", port: portNum, key: key.trim() });
      await startHostServer(portNum, key.trim(), true);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the host server");
      setBusy(false);
    }
  }

  const address = `http://${lanIp ?? "<this-pc-ip>"}:${Number(port) || DEFAULT_PORT}`;

  return (
    <Shell title="Set up the main PC" subtitle="Other computers will connect to this one.">
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <div className="text-xs text-muted-foreground">Other PCs will connect to</div>
          <div className="font-mono text-sm">{address}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Port</Label>
            <Input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>Access key (optional)</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="shared secret" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Set an access key so only your PCs can connect. You will enter the same key on each other PC.
          The first time you run this, Windows may ask you to allow userrepair on your network &mdash; choose Allow.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <Button className="flex-1" onClick={start} disabled={busy}>
            {busy ? "Starting..." : "Start as main PC"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

/** Normalize "192.168.1.5", "192.168.1.5:8787", or a full URL to a base URL. */
function normalizeHost(input: string): string {
  let host = input.trim();
  if (host === "") return "";
  if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
  const withoutScheme = host.replace(/^https?:\/\//i, "");
  if (!withoutScheme.includes(":")) host = `${host}:${DEFAULT_PORT}`;
  return host.replace(/\/+$/, "");
}

function ClientSetup({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [host, setHost] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    const url = normalizeHost(host);
    if (url === "") {
      toast.error("Enter the main PC's address");
      return;
    }
    setBusy(true);
    try {
      const r = await checkHost(url, key.trim());
      if (!r.ok) throw new Error("Host did not respond correctly");
      setNetConfig({ mode: "client", host: url, key: key.trim() });
      toast.success(`Connected to ${r.shop || "the main PC"}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect to the main PC");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Connect to the main PC" subtitle="Enter the address shown on the main PC's setup screen.">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Main PC address</Label>
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50:8787" autoFocus />
          <p className="text-xs text-muted-foreground">
            You can type just the IP (e.g. 192.168.1.50) and the default port {DEFAULT_PORT} is added.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Access key</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="leave blank if none" />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <Button className="flex-1" onClick={connect} disabled={busy}>
            {busy ? "Connecting..." : "Connect"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-auto bg-background p-6">
      <div className="my-6 w-full max-w-lg space-y-5 rounded-xl border border-border bg-card p-7 shadow-lg">
        <div className="text-center">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Choice({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent"
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
