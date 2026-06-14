import { useState, type ChangeEvent, type FormEvent } from "react";
import { Rocket, Upload } from "lucide-react";
import defaultLogo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { createAccount, usernameTaken } from "@/lib/repos/auth";
import { setSetting } from "@/lib/repos/settings";
import { fileToLogoDataUrl } from "@/lib/image";
import { useBrandStore } from "@/stores/brand";
import { useAuthStore } from "@/stores/auth";

/** First-run setup: the owner creates their account and configures the shop. */
export default function SetupScreen({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    business: "",
    ownerName: "",
    username: "",
    password: "",
    confirm: "",
    phone: "",
    email: "",
  });
  const [logoData, setLogoData] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLogoData(await fileToLogoDataUrl(file));
    } catch {
      toast.error("Could not load that image");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.business.trim() === "" || form.ownerName.trim() === "" || form.username.trim() === "" || form.password === "") {
      setError("Business name, your name, username, and password are required.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (await usernameTaken(form.username.trim())) {
        setError("That username is already taken.");
        return;
      }
      await createAccount({
        name: form.ownerName.trim(),
        username: form.username.trim(),
        password: form.password,
        role: "owner",
      });
      await setSetting("shop.name", form.business.trim());
      await setSetting("shop.phone", form.phone.trim());
      await setSetting("shop.email", form.email.trim());
      if (logoData) await useBrandStore.getState().setLogo(logoData);
      const ok = await useAuthStore.getState().login(form.username.trim(), form.password);
      if (!ok) {
        setError("Account created, but sign-in failed. Try logging in.");
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-auto bg-background p-6">
      <form onSubmit={onSubmit} className="my-6 w-full max-w-lg space-y-5 rounded-xl border border-border bg-card p-7 shadow-lg">
        <div className="flex flex-col items-center gap-2 text-center">
          <Rocket className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Welcome to userrepair</h1>
            <p className="text-sm text-muted-foreground">Set up your shop and owner account to get started.</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-md border border-border p-3">
          <img src={logoData ?? defaultLogo} alt="logo" className="h-16 w-16 shrink-0 rounded-md object-contain" />
          <div className="min-w-0 flex-1">
            <Label>Shop logo (optional)</Label>
            <p className="text-xs text-muted-foreground">Shown in the app. Does not change the application icon.</p>
            <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary hover:underline">
              <Upload className="h-4 w-4" /> Upload logo
              <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Business name</Label>
            <Input value={form.business} onChange={(e) => set("business", e.target.value)} placeholder="My Repair Shop" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="mb-2 text-sm font-medium">Owner account</div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Your name</Label>
                <Input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm password</Label>
                  <Input type="password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} autoComplete="new-password" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating..." : "Finish setup"}
        </Button>
      </form>
    </div>
  );
}
