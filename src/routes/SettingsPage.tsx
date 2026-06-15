import { useState, useEffect, useMemo, type ChangeEvent } from "react";
import { Plus, Trash2, Save, Plug, Gift, Upload, Network, Copy, Printer, FolderOpen, Camera, Mail, MessageSquare } from "lucide-react";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { loadSettings, setSetting, getSetting } from "@/lib/repos/settings";
import {
  listAccounts,
  createAccount,
  deactivateAccount,
  resetPassword,
  usernameTaken,
} from "@/lib/repos/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useThemeStore } from "@/stores/theme";
import { useAuthStore } from "@/stores/auth";
import { useBrandStore } from "@/stores/brand";
import { fileToLogoDataUrl } from "@/lib/image";
import { callCommand, getNetConfig, getLanIp, checkHost, clearNetConfig, DEFAULT_PORT } from "@/lib/net";
import { sampleReceipt } from "@/lib/receipt";
import { ReceiptPreviewDialog } from "@/components/receipt/ReceiptPreviewDialog";
import { AddressAutocomplete } from "@/components/shared/AddressAutocomplete";
import { loadSmtpConfig, sendTestEmail, sendTestSms, sendTestPingram, NOTIFIABLE_STATUSES, type SmtpConfig } from "@/lib/email";
import { ROLE_LABEL } from "@/lib/roles";
import { formatBasisPoints, dollarsToCents } from "@/lib/format";
import type { ThemeMode, TechRole } from "@/types";

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Shop configuration, staff, and database tools." />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="technicians">Technicians</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="bench">Bench</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="technicians">
          <TechniciansSettings />
        </TabsContent>
        <TabsContent value="payments">
          <div className="space-y-4">
            <PaymentsSettings />
            <ReceiptSettings />
          </div>
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsSettings />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsSettings />
        </TabsContent>
        <TabsContent value="network">
          <NetworkSettings />
        </TabsContent>
        <TabsContent value="bench">
          <CameraSettings />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="database">
          <DatabaseInfo />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NotificationsSettings() {
  const { data } = useAsync(loadSmtpConfig, []);
  const [draft, setDraft] = useState<SmtpConfig | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [testingPingram, setTestingPingram] = useState(false);
  const [lanHost, setLanHost] = useState("YOUR-MAIN-PC");

  useEffect(() => {
    if (data && !draft) {
      setDraft(data);
      setTestTo(data.fromEmail || data.user);
    }
  }, [data, draft]);

  useEffect(() => {
    void getLanIp().then(setLanHost).catch(() => setLanHost("YOUR-MAIN-PC"));
  }, []);

  if (!draft) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const d = draft;

  // Build the inbound webhook URLs live from the draft. A public base (e.g. a
  // Cloudflare Tunnel) overrides the LAN address; the token is the dedicated
  // inbound secret set just below, not the LAN access key.
  const webhookBase = d.publicBaseUrl.trim()
    ? d.publicBaseUrl.trim().replace(/\/+$/, "")
    : `http://${lanHost}:${getNetConfig().port || DEFAULT_PORT}`;
  const tokenPart = d.inboundToken.trim() ? `?token=${encodeURIComponent(d.inboundToken.trim())}` : "";
  const webhookSms = `${webhookBase}/inbound/sms${tokenPart}`;
  const webhookEmail = `${webhookBase}/inbound/email${tokenPart}`;

  function set<K extends keyof SmtpConfig>(k: K, v: SmtpConfig[K]) {
    setDraft((prev) => (prev ? { ...prev, [k]: v } : prev));
  }
  function toggleStatus(s: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const on = prev.statuses.includes(s);
      return { ...prev, statuses: on ? prev.statuses.filter((x) => x !== s) : [...prev.statuses, s] };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await setSetting("notify.enabled", d.enabled);
      await setSetting("notify.sms_enabled", d.smsEnabled);
      await setSetting("notify.pingram_enabled", d.pingramEnabled);
      await setSetting("notify.pingram_api_key", d.pingramApiKey.trim());
      await setSetting("notify.pingram_type", (d.pingramType || "repair_status_update").trim());
      await setSetting("notify.pingram_base_url", (d.pingramBaseUrl || "https://api.pingram.io").trim());
      await setSetting("notify.pingram_email_enabled", d.pingramEmailEnabled);
      await setSetting("notify.pingram_sender_domain", d.pingramSenderDomain.trim().replace(/^@+/, ""));
      await setSetting("notify.inbound_token", d.inboundToken.trim());
      await setSetting("notify.public_base_url", d.publicBaseUrl.trim().replace(/\/+$/, ""));
      await setSetting("notify.smtp_host", d.host.trim());
      await setSetting("notify.smtp_port", Number(d.port) || 587);
      await setSetting("notify.smtp_user", d.user.trim());
      await setSetting("notify.smtp_pass", d.pass);
      await setSetting("notify.from_name", d.fromName.trim());
      await setSetting("notify.from_email", d.fromEmail.trim());
      await setSetting("notify.statuses", d.statuses);
      toast.success("Notification settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!testTo.includes("@")) { toast.error("Enter a recipient email"); return; }
    setTesting(true);
    try {
      await sendTestEmail(d, testTo.trim());
      toast.success(`Test email sent to ${testTo.trim()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the test email");
    } finally {
      setTesting(false);
    }
  }

  async function testSms() {
    if (testPhone.replace(/\D/g, "").length < 10) { toast.error("Enter a 10-digit mobile number"); return; }
    setTestingSms(true);
    try {
      const n = await sendTestSms(d, testPhone.trim());
      toast.success(`Backup text sent to ${n} carrier gateways for ${testPhone.trim()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the test text");
    } finally {
      setTestingSms(false);
    }
  }

  async function testPingram() {
    if (testPhone.replace(/\D/g, "").length < 10) { toast.error("Enter a 10-digit mobile number"); return; }
    setTestingPingram(true);
    try {
      await sendTestPingram(d, testPhone.trim());
      toast.success(`Test text sent via Pingram to ${testPhone.trim()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the test text");
    } finally {
      setTestingPingram(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email notifications</CardTitle>
        <CardDescription>
          Email customers a friendly update when their repair changes status. Use your own SMTP provider - Gmail works with an app password (requires 2-step verification turned on).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={d.enabled} onCheckedChange={(v) => set("enabled", v)} />
          Send status emails to customers
        </label>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={d.pingramEmailEnabled} onCheckedChange={(v) => set("pingramEmailEnabled", v)} />
            Send emails through Pingram (recommended)
          </label>
          <p className="text-xs text-muted-foreground">
            Uses your Pingram API key and verified domain - no separate email server needed. Each email is sent from the signed-in user&apos;s own address, <code className="rounded bg-muted px-1">username@domain</code> (so JURMR sends from <code className="rounded bg-muted px-1">JURMR@iamjrmh.xyz</code>), with the sender name shown as <strong>Name (Role)</strong>, e.g. &quot;Jeremiah (Owner)&quot;. The subject is the ticket&apos;s name and ID. Set the API key and notification type under <strong>Text messages</strong> below (enable the Email channel on that same notification).
          </p>
          <div className="space-y-1.5">
            <Label>Sending domain</Label>
            <Input value={d.pingramSenderDomain} onChange={(e) => set("pingramSenderDomain", e.target.value)} placeholder="iamjrmh.xyz" />
            <p className="text-[11px] text-muted-foreground">The domain you verified in Pingram. Each user&apos;s login username becomes the local part of their sender address.</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          The SMTP settings below are an optional fallback, only used when &quot;Send emails through Pingram&quot; is off. Gmail works with an app password (requires 2-step verification turned on).
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>SMTP host</Label><Input value={d.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.gmail.com" /></div>
          <div className="space-y-1.5"><Label>Port</Label><Input value={String(d.port)} onChange={(e) => set("port", Number(e.target.value) || 587)} placeholder="587" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Username (email)</Label><Input value={d.user} onChange={(e) => set("user", e.target.value)} placeholder="shop@gmail.com" /></div>
          <div className="space-y-1.5"><Label>App password</Label><Input type="password" value={d.pass} onChange={(e) => set("pass", e.target.value)} placeholder="16-character app password" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>From name</Label><Input value={d.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Your shop name" /></div>
          <div className="space-y-1.5"><Label>From email</Label><Input value={d.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="shop@gmail.com" /></div>
        </div>

        <div className="space-y-1.5">
          <Label>Notify on these status changes</Label>
          <div className="flex flex-wrap gap-2">
            {NOTIFIABLE_STATUSES.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => toggleStatus(s)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${d.statuses.includes(s) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-ring"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5"><Label>Send a test to</Label><Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></div>
          <Button variant="outline" onClick={test} disabled={testing}>{testing ? "Sending..." : "Send test"}</Button>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-medium"><MessageSquare className="h-4 w-4" /> Text messages</div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={d.pingramEnabled} onCheckedChange={(v) => set("pingramEnabled", v)} />
            Text customers via Pingram (real SMS)
          </label>
          <p className="text-xs text-muted-foreground">
            Sends real carrier texts through Pingram to customers whose preferred contact is set to SMS. In Pingram, create a notification of type <code className="rounded bg-muted px-1">repair_status_update</code> with the SMS channel enabled, then paste your API key below. Pingram handles the A2P 10DLC carrier registration.
          </p>
          <div className="space-y-1.5"><Label>API key</Label><Input type="password" value={d.pingramApiKey} onChange={(e) => set("pingramApiKey", e.target.value)} placeholder="pingram_sk_..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Notification type</Label><Input value={d.pingramType} onChange={(e) => set("pingramType", e.target.value)} placeholder="repair_status_update" /></div>
            <div className="space-y-1.5"><Label>API URL</Label><Input value={d.pingramBaseUrl} onChange={(e) => set("pingramBaseUrl", e.target.value)} placeholder="https://api.pingram.io" /></div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5"><Label>Send a test text to</Label><Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="555-123-4567" /></div>
            <Button variant="outline" onClick={testPingram} disabled={testingPingram}>{testingPingram ? "Sending..." : "Send test (Pingram)"}</Button>
          </div>

          <div className="space-y-1.5">
            <Label>Inbound webhooks (for the Inbox)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-muted-foreground">Public address (optional)</Label>
                <Input value={d.publicBaseUrl} onChange={(e) => set("publicBaseUrl", e.target.value)} placeholder="https://your-tunnel.trycloudflare.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-muted-foreground">Webhook token (optional)</Label>
                <div className="flex gap-2">
                  <Input value={d.inboundToken} onChange={(e) => set("inboundToken", e.target.value)} placeholder="leave blank for none" />
                  <Button type="button" variant="outline" size="sm" onClick={() => set("inboundToken", crypto.randomUUID().replace(/-/g, ""))}>Generate</Button>
                </div>
              </div>
            </div>
            <Input readOnly value={webhookSms} className="mt-1.5 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
            <Input readOnly value={webhookEmail} className="mt-1.5 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
            <p className="text-[11px] text-muted-foreground">
              Paste the first into Pingram&apos;s SMS inbound webhook and the second into the Email inbound webhook, so customer replies land in the Inbox (Manager+). Set a <strong>Public address</strong> (e.g. your free Cloudflare Tunnel URL) so Pingram can reach this PC over the internet, and the URLs above update to match. The token is a dedicated secret for these webhooks (separate from the LAN access key); leave it blank to accept any caller. <strong>Save</strong> after changing either.
            </p>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={d.smsEnabled} onCheckedChange={(v) => set("smsEnabled", v)} />
              Enable email-to-SMS backup
            </label>
            <p className="text-xs text-muted-foreground">
              If Pingram is off or a text fails, fall back to the free carrier email-to-SMS gateways. Best-effort and offline-tolerant, but no delivery receipt and some carriers (AT&T) often block it.
            </p>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={testSms} disabled={testingSms}>{testingSms ? "Sending..." : "Test backup"}</Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Only customers with an email on file are notified, and sending needs an internet connection.</p>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}><Save /> {saving ? "Saving..." : "Save"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CameraSettings() {
  const [dir, setDir] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSetting<string>("camera.output_dir", "").then(setDir);
  }, []);

  async function choose() {
    const picked = await openDirectory({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    setSaving(true);
    try {
      await setSetting("camera.output_dir", picked);
      setDir(picked);
      toast.success("Capture folder set");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await setSetting("camera.output_dir", "");
      setDir("");
      toast.success("Capture folder cleared");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Camera className="h-4 w-4" /> Microscope captures</CardTitle>
        <CardDescription>Where the Microsoldering tab saves photos and recordings. On a multi-PC setup, captures from every PC are sent to this folder on the main PC, so set a path that exists on the main PC.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label>Capture output folder</Label>
        <div className="flex items-center gap-2">
          <Input readOnly value={dir ?? ""} placeholder="No folder set" className="font-mono text-xs" />
          <Button variant="outline" onClick={choose} disabled={saving}><FolderOpen /> Choose</Button>
          {dir ? <Button variant="ghost" onClick={clear} disabled={saving}>Clear</Button> : null}
        </div>
        <p className="text-xs text-muted-foreground">Technicians and managers can capture from the microscope; only managers and the owner can change this folder.</p>
      </CardContent>
    </Card>
  );
}

function GeneralSettings() {
  const { data, loading } = useAsync(loadSettings, []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (loading || !data) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const settings = data;

  const get = (key: string): string => draft[key] ?? str(settings[key]);
  const setField = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  async function saveAll() {
    setSaving(true);
    try {
      await setSetting("shop.name", get("shop.name"));
      // Reflect the new name in the sidebar straight away.
      useBrandStore.getState().setName(get("shop.name"));
      await setSetting("shop.address", get("shop.address"));
      await setSetting("shop.phone", get("shop.phone"));
      await setSetting("shop.email", get("shop.email"));
      await setSetting("tickets.prefix", get("tickets.prefix") || "RS");
      const taxBp = Math.round(parseFloat(get("__taxPercent") || String(num(settings["finance.tax_rate_bp"], 0) / 100)) * 100);
      await setSetting("finance.tax_rate_bp", Number.isFinite(taxBp) ? taxBp : 0);
      const laborCents = Math.round(parseFloat(get("__laborRate") || String(num(settings["finance.labor_rate_cents"], 6000) / 100)) * 100);
      await setSetting("finance.labor_rate_cents", Number.isFinite(laborCents) ? laborCents : 6000);
      toast.success("Settings saved");
    } finally {
      setSaving(false);
    }
  }

  const taxBp = num(settings["finance.tax_rate_bp"], 0);
  const laborRate = num(settings["finance.labor_rate_cents"], 6000);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Shop information</CardTitle>
          <CardDescription>Used on invoices and exported PDFs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <LogoSetting />
          <Field label="Shop name" value={get("shop.name")} onChange={(v) => setField("shop.name", v)} />
          <AddressAutocomplete label="Address" value={get("shop.address")} onChange={(v) => setField("shop.address", v)} />
          <Field label="Phone" value={get("shop.phone")} onChange={(v) => setField("shop.phone", v)} />
          <Field label="Email" value={get("shop.email")} onChange={(v) => setField("shop.email", v)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tickets &amp; finance</CardTitle>
          <CardDescription>Defaults applied when creating records.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Ticket number prefix" value={get("tickets.prefix") || "RS"} onChange={(v) => setField("tickets.prefix", v)} />
          <div className="space-y-1.5">
            <Label>Tax rate (%)</Label>
            <Input
              type="number"
              step="0.01"
              defaultValue={(taxBp / 100).toString()}
              onChange={(e) => setField("__taxPercent", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Currently {formatBasisPoints(taxBp)}. Stored as basis points.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Labor rate ($/hour)</Label>
            <Input
              type="number"
              step="0.01"
              defaultValue={(laborRate / 100).toString()}
              onChange={(e) => setField("__laborRate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">1 unit of labor = 1 hour. Fractional hours (e.g. 1.4) bill pro-rata.</p>
          </div>
        </CardContent>
      </Card>
      <div className="lg:col-span-2">
        <Button onClick={saveAll} disabled={saving}>
          <Save /> Save settings
        </Button>
      </div>
    </div>
  );
}

function LogoSetting() {
  const logo = useBrandStore((s) => s.logo);
  const setLogo = useBrandStore((s) => s.setLogo);
  const clearLogo = useBrandStore((s) => s.clearLogo);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await setLogo(await fileToLogoDataUrl(file));
      toast.success("Logo updated");
    } catch {
      toast.error("Could not load that image");
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-md border border-border p-3">
      <img src={logo} alt="logo" className="h-16 w-16 shrink-0 rounded-md object-contain" />
      <div className="flex-1">
        <Label>App logo</Label>
        <p className="text-xs text-muted-foreground">Shown at the top-left of the app. Does not change the application icon.</p>
        <div className="mt-1 flex items-center gap-3 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-primary hover:underline">
            <Upload className="h-4 w-4" /> Upload
            <input type="file" accept="image/*" className="hidden" onChange={onFile} />
          </label>
          <button type="button" onClick={() => void clearLogo()} className="text-muted-foreground hover:text-foreground cursor-pointer">
            Use default
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TechniciansSettings() {
  const currentRole = useAuthStore((s) => s.user?.role);
  const currentId = useAuthStore((s) => s.user?.id);
  const canManage = currentRole === "owner" || currentRole === "manager";
  const { data, loading, reload } = useAsync(listAccounts, []);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "technician" as TechRole });
  const [resetId, setResetId] = useState<number | null>(null);

  const roleOptions: TechRole[] = currentRole === "owner" ? ["manager", "technician", "clerk"] : ["technician", "clerk"];

  async function add() {
    if (form.name.trim() === "" || form.username.trim() === "" || form.password === "") {
      toast.error("Name, username, and password are required");
      return;
    }
    if (await usernameTaken(form.username.trim())) {
      toast.error("That username is already taken");
      return;
    }
    await createAccount({ name: form.name.trim(), username: form.username.trim(), password: form.password, role: form.role });
    setForm({ name: "", username: "", password: "", role: "technician" });
    reload();
    toast.success("Account created");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff &amp; accounts</CardTitle>
        <CardDescription>
          {canManage
            ? "Create login accounts for managers, technicians, and clerks."
            : "Only owners and managers can manage accounts."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 md:grid-cols-5 md:items-end">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as TechRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={add}><Plus /> Create</Button>
          </div>
        )}
        <div className="divide-y divide-border rounded-md border border-border">
          {loading || !data ? (
            <div className="p-3 text-sm text-muted-foreground">Loading...</div>
          ) : (
            data.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                <span className="font-medium">{t.name}</span>
                {t.username && <span className="text-xs text-muted-foreground">@{t.username}</span>}
                <Badge variant="secondary">{ROLE_LABEL[t.role]}</Badge>
                {t.active === 0 && <Badge variant="outline">inactive</Badge>}
                {canManage && t.active === 1 && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setResetId(t.id)}>
                      Reset password
                    </Button>
                    {t.id !== currentId && t.role !== "owner" && (
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={async () => { await deactivateAccount(t.id); reload(); }}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
      {resetId !== null && (
        <ResetPasswordDialog id={resetId} onClose={() => setResetId(null)} />
      )}
    </Card>
  );
}

function ResetPasswordDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [password, setPassword] = useState("");
  async function save() {
    if (password === "") {
      toast.error("Enter a new password");
      return;
    }
    await resetPassword(id, password);
    toast.success("Password reset");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>New password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppearanceSettings() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Dark mode is the default. System follows the OS.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <Label>Theme</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}

function PaymentsSettings() {
  const { data, loading } = useAsync(loadSettings, []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [env, setEnv] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refund, setRefund] = useState({ id: "", amount: "" });
  const [refunding, setRefunding] = useState(false);

  if (loading || !data) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const settings = data;
  const get = (key: string): string => draft[key] ?? str(settings[key]);
  const setField = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  async function doRefund() {
    if (refund.id.trim() === "") {
      toast.error("Enter a Square payment id");
      return;
    }
    setRefunding(true);
    try {
      const res = await callCommand<{ status: string }>("square_refund_payment", {
        paymentId: refund.id.trim(),
        amountCents: dollarsToCents(refund.amount),
        reason: "Manual refund",
      });
      toast.success(`Refund ${res.status}`);
      setRefund({ id: "", amount: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setRefunding(false);
    }
  }
  const enabledVal = enabled ?? settings["square.enabled"] === true;
  const envVal = env ?? (str(settings["square.environment"], "production") || "production");

  async function persist() {
    await setSetting("square.enabled", enabledVal);
    await setSetting("square.environment", envVal);
    await setSetting("square.application_id", get("square.application_id"));
    await setSetting("square.access_token", get("square.access_token"));
    await setSetting("square.location_id", get("square.location_id"));
    await setSetting("square.device_id", get("square.device_id"));
    await setSetting("square.currency", get("square.currency") || "USD");
    await setSetting("square.webhook_signature_key", get("square.webhook_signature_key"));
    const thr = Math.round(parseFloat(get("__voidThreshold") || String(num(settings["pos.void_auth_threshold_cents"], 5000) / 100)) * 100);
    await setSetting("pos.void_auth_threshold_cents", Number.isFinite(thr) ? thr : 5000);
  }

  async function save() {
    setSaving(true);
    try {
      await persist();
      toast.success("Payment settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      await persist();
      const name = await callCommand<string>("square_test_connection");
      toast.success(`Connected to ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Square payments</CardTitle>
        <CardDescription>
          Credentials for the POS. These will be restricted to owners and managers once login is added.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <div className="text-sm font-medium">Enable Square payments</div>
            <div className="text-xs text-muted-foreground">When off, the POS only accepts cash.</div>
          </div>
          <Switch checked={enabledVal} onCheckedChange={setEnabled} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Environment</Label>
            <Select value={envVal} onValueChange={setEnv}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="Currency" value={get("square.currency") || "USD"} onChange={(v) => setField("square.currency", v)} />
        </div>
        <Field label="Application ID" value={get("square.application_id")} onChange={(v) => setField("square.application_id", v)} />
        <div className="space-y-1.5">
          <Label>Access token</Label>
          <Input type="password" value={get("square.access_token")} onChange={(e) => setField("square.access_token", e.target.value)} placeholder="EAAA..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location ID" value={get("square.location_id")} onChange={(v) => setField("square.location_id", v)} />
          <Field label="Terminal device ID (optional)" value={get("square.device_id")} onChange={(v) => setField("square.device_id", v)} />
        </div>
        <div className="space-y-1.5">
          <Label>Webhook signature key (optional)</Label>
          <Input type="password" value={get("square.webhook_signature_key")} onChange={(e) => setField("square.webhook_signature_key", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Manager approval for refunds above ($)</Label>
          <Input
            type="number"
            step="1"
            defaultValue={String(num(settings["pos.void_auth_threshold_cents"], 5000) / 100)}
            onChange={(e) => setField("__voidThreshold", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Clerks can refund up to this amount; larger refunds need a manager or owner to authorize.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}><Save /> Save</Button>
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? "Testing..." : "Save & test connection"}
          </Button>
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="text-sm font-medium">Manual refund</div>
          <p className="text-xs text-muted-foreground">
            Refund a Square payment by id, e.g. an orphaned charge from an abandoned sale. Amount in dollars.
          </p>
          <div className="grid grid-cols-[1fr_120px_auto] gap-2">
            <Input placeholder="Square payment id" value={refund.id} onChange={(e) => setRefund({ ...refund, id: e.target.value })} />
            <Input placeholder="0.00" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
            <Button variant="outline" onClick={doRefund} disabled={refunding}>
              {refunding ? "..." : "Refund"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReceiptSettings() {
  const { data, loading } = useAsync(loadSettings, []);
  const [width, setWidth] = useState<string | null>(null);
  const [footer, setFooter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const sample = useMemo(() => sampleReceipt(), []);

  if (loading || !data) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const settings = data;
  const widthVal = width ?? String(num(settings["pos.receipt_width_mm"], 80));
  const footerVal = footer ?? str(settings["pos.receipt_footer"], "Thank you for your business!");

  async function save() {
    setSaving(true);
    try {
      await setSetting("pos.receipt_width_mm", Number(widthVal) === 58 ? 58 : 80);
      await setSetting("pos.receipt_footer", footerVal);
      toast.success("Receipt settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function openPreview() {
    await save();
    setPreviewOpen(true);
  }

  return (
    <>
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Printer className="h-4 w-4" /> Receipt printer</CardTitle>
        <CardDescription>
          Receipts are generated locally for any USB or thermal receipt printer. Preview the test receipt at your paper width, then print it or save it as a PNG or PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Paper width</Label>
            <Select value={widthVal} onValueChange={setWidth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58 mm (small)</SelectItem>
                <SelectItem value="80">80 mm (standard)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Footer message</Label>
          <Input value={footerVal} onChange={(e) => setFooter(e.target.value)} placeholder="Thank you for your business!" />
        </div>
        <p className="text-xs text-muted-foreground">
          Tip: in the print dialog, set your receipt printer as the destination and turn off margins / headers for the cleanest output.
        </p>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}><Save /> Save</Button>
          <Button variant="outline" onClick={openPreview}><Printer /> Print test receipt</Button>
        </div>
      </CardContent>
    </Card>
    <ReceiptPreviewDialog
      payload={sample}
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      initialWidth={Number(widthVal) === 58 ? 58 : 80}
    />
    </>
  );
}

function RewardsSettings() {
  const { data, loading } = useAsync(loadSettings, []);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (loading || !data) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const settings = data;
  const enabledVal = enabled ?? settings["rewards.enabled"] === true;
  const earn = num(settings["rewards.earn_per_dollar"], 1);
  const redeem = num(settings["rewards.redeem_cents_per_point"], 1);
  const pointsPerDollarRedeem = redeem > 0 ? Math.round(100 / redeem) : 0;

  async function save() {
    setSaving(true);
    try {
      await setSetting("rewards.enabled", enabledVal);
      const e = parseFloat(draft["__earn"] || String(earn));
      await setSetting("rewards.earn_per_dollar", Number.isFinite(e) ? e : 1);
      const r = parseFloat(draft["__redeem"] || String(redeem));
      await setSetting("rewards.redeem_cents_per_point", Number.isFinite(r) && r > 0 ? r : 1);
      toast.success("Rewards settings saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gift className="h-4 w-4" /> Rewards program</CardTitle>
        <CardDescription>Customers earn points on POS sales and redeem them as a discount.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <div className="text-sm font-medium">Enable rewards</div>
            <div className="text-xs text-muted-foreground">Points are only earned and redeemable when on.</div>
          </div>
          <Switch checked={enabledVal} onCheckedChange={setEnabled} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Points earned per $1 spent</Label>
            <Input type="number" step="0.1" defaultValue={String(earn)} onChange={(e) => setDraft((d) => ({ ...d, __earn: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Cents per point when redeemed</Label>
            <Input type="number" step="0.1" defaultValue={String(redeem)} onChange={(e) => setDraft((d) => ({ ...d, __redeem: e.target.value }))} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          With these rates, every $1 earns {earn} point{earn === 1 ? "" : "s"}, and {pointsPerDollarRedeem} points redeem for $1.
        </p>
        <Button onClick={save} disabled={saving}><Save /> Save</Button>
      </CardContent>
    </Card>
  );
}

function NetworkSettings() {
  const cfg = getNetConfig();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "owner" || role === "manager";
  const { data: lanIp } = useAsync(getLanIp, []);
  const [testing, setTesting] = useState(false);

  const hostAddress = `http://${lanIp ?? "..."}:${cfg.port || DEFAULT_PORT}`;

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  async function testHost() {
    setTesting(true);
    try {
      const r = await checkHost(cfg.host, cfg.key);
      toast.success(`Connected to ${r.shop || "host"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reach host");
    } finally {
      setTesting(false);
    }
  }

  function changeSetup() {
    if (!confirm("Change this PC's network setup? The app will restart so you can pick a new mode.")) return;
    clearNetConfig();
    location.reload();
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Network className="h-4 w-4" /> Multi-PC network</CardTitle>
        <CardDescription>How this computer shares data with the rest of the shop.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cfg.mode === "standalone" && (
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-medium">Standalone</div>
            <p className="text-xs text-muted-foreground">
              This PC keeps its own database and is not connected to any other computer.
            </p>
          </div>
        )}

        {cfg.mode === "host" && (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="text-sm font-medium">This PC is the host (main)</div>
              <p className="text-xs text-muted-foreground">
                It owns the shop database and serves it to the other PCs. Keep it on and signed in
                during business hours.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Address for other PCs</Label>
              <div className="flex gap-2">
                <Input readOnly value={hostAddress} />
                <Button variant="outline" size="icon" onClick={() => copy(hostAddress)}><Copy className="h-4 w-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">
                On each other PC, choose &quot;Connect to the main PC&quot; and enter this address.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Access key</Label>
              <div className="flex gap-2">
                <Input readOnly value={cfg.key || "(none)"} />
                {cfg.key && (
                  <Button variant="outline" size="icon" onClick={() => copy(cfg.key)}><Copy className="h-4 w-4" /></Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Other PCs must enter this key to connect.</p>
            </div>
          </div>
        )}

        {cfg.mode === "client" && (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="text-sm font-medium">This PC is a client</div>
              <p className="text-xs text-muted-foreground">It connects to the host PC for all data.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Host address</Label>
              <Input readOnly value={cfg.host} />
            </div>
            <Button variant="outline" onClick={testHost} disabled={testing}>
              {testing ? "Testing..." : "Test connection"}
            </Button>
          </div>
        )}

        {canManage && (
          <div className="border-t border-border pt-3">
            <Button variant="ghost" className="text-muted-foreground" onClick={changeSetup}>
              Change network setup
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DatabaseInfo() {
  const { data, loading } = useAsync(async () => {
    const { count } = await import("@/lib/db");
    const tickets = await count("SELECT COUNT(*) AS n FROM tickets WHERE deleted_at IS NULL");
    const customers = await count("SELECT COUNT(*) AS n FROM customers WHERE deleted_at IS NULL");
    const items = await count("SELECT COUNT(*) AS n FROM inventory_items WHERE deleted_at IS NULL");
    const measurements = await count("SELECT COUNT(*) AS n FROM measurements WHERE deleted_at IS NULL");
    return { tickets, customers, items, measurements };
  }, []);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Database</CardTitle>
        <CardDescription>Record counts. Use Backup &amp; Restore to archive the database.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Tickets" value={data.tickets} />
            <Stat label="Customers" value={data.customers} />
            <Stat label="Inventory items" value={data.items} />
            <Stat label="Measurements" value={data.measurements} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
