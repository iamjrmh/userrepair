import { useState, type ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Save, Plug, Gift, Upload } from "lucide-react";
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
import { loadSettings, setSetting } from "@/lib/repos/settings";
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
          <PaymentsSettings />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsSettings />
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
          <Field label="Address" value={get("shop.address")} onChange={(v) => setField("shop.address", v)} />
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
      const res = await invoke<{ status: string }>("square_refund_payment", {
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
      const name = await invoke<string>("square_test_connection");
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
