import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth";
import { useBrandStore } from "@/stores/brand";

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const logo = useBrandStore((s) => s.logo);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ok = await login(username, password);
      if (!ok) setError("Incorrect username or password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-7 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={logo} alt="userrepair" className="h-28 w-28 rounded-2xl shadow-sm" />
          <p className="text-sm text-muted-foreground">Sign in to the bench</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={busy || username === "" || password === ""}>
          <LogIn /> {busy ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
