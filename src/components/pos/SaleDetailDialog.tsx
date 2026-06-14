import { useState } from "react";
import { Undo2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { listSaleItems, listPayments, voidSale } from "@/lib/repos/pos";
import { getSetting } from "@/lib/repos/settings";
import { authorize } from "@/lib/repos/auth";
import { useAuthStore } from "@/stores/auth";
import { formatCents, formatDateTime } from "@/lib/format";
import type { AuthUser, PosSale } from "@/types";

/**
 * Sale detail with line items, payment breakdown, and a void/refund. Anyone with
 * POS access can refund, but refunds above the configured threshold (default $50)
 * require a manager or owner to authorize with their credentials. Managers and
 * owners self-authorize.
 */
export function SaleDetailDialog({
  sale,
  onClose,
  onChanged,
}: {
  sale: PosSale;
  onClose: () => void;
  onChanged: () => void;
}) {
  const role = useAuthStore((s) => s.user?.role);
  const currentName = useAuthStore((s) => s.user?.name);
  const isManager = role === "owner" || role === "manager";

  const { data } = useAsync(async () => ({
    items: await listSaleItems(sale.id),
    payments: await listPayments(sale.id),
    threshold: await getSetting<number>("pos.void_auth_threshold_cents", 5000),
  }), [sale.id]);

  const [confirmVoid, setConfirmVoid] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const refunded = sale.payment_status === "refunded";

  const threshold = data?.threshold ?? 5000;
  const needsAuth = !isManager && sale.total_cents > threshold;

  function onVoidClick() {
    if (needsAuth) setAuthOpen(true);
    else setConfirmVoid(true);
  }

  async function doVoid(authorizedBy: string | undefined) {
    try {
      await voidSale(sale.id, authorizedBy);
      toast.success("Sale voided and refunded");
      onClose();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Void failed");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {sale.sale_number}
            {refunded && <Badge variant="destructive">refunded</Badge>}
          </DialogTitle>
          <DialogDescription>{formatDateTime(sale.created_at)} - {formatCents(sale.total_cents)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Items</div>
            <div className="space-y-1">
              {(data?.items ?? []).map((it) => (
                <div key={it.id} className="flex justify-between">
                  <span>{it.description} x{it.quantity}</span>
                  <span className="tabular-nums">{formatCents(it.line_total_cents)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Payments</div>
            <div className="space-y-1">
              {(data?.payments ?? []).map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="capitalize">{p.method}{p.last4 ? ` ****${p.last4}` : ""}{p.change_cents ? ` (change ${formatCents(p.change_cents)})` : ""}</span>
                  <span className="tabular-nums">{formatCents(p.amount_cents)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          {!refunded && (
            <Button variant="destructive" onClick={onVoidClick}>
              <Undo2 /> Void / refund
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title="Void this sale?"
        description="Card and Terminal payments are refunded through Square, inventory is restored, and the revenue is reversed. Cash is returned to the customer at the counter."
        confirmLabel="Void & refund"
        destructive
        onConfirm={() => doVoid(currentName)}
      />

      <ManagerAuthDialog
        open={authOpen}
        amount={sale.total_cents}
        threshold={threshold}
        onOpenChange={setAuthOpen}
        onAuthorized={(mgr) => {
          setAuthOpen(false);
          void doVoid(mgr.name);
        }}
      />
    </Dialog>
  );
}

function ManagerAuthDialog({
  open,
  amount,
  threshold,
  onOpenChange,
  onAuthorized,
}: {
  open: boolean;
  amount: number;
  threshold: number;
  onOpenChange: (open: boolean) => void;
  onAuthorized: (mgr: AuthUser) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const mgr = await authorize(username, password);
      if (!mgr || (mgr.role !== "owner" && mgr.role !== "manager")) {
        setError("Manager or owner credentials required.");
        return;
      }
      setUsername("");
      setPassword("");
      onAuthorized(mgr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Manager approval</DialogTitle>
          <DialogDescription>
            Refunds over {formatCents(threshold)} need a manager or owner to authorize. This refund is {formatCents(amount)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Manager username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || username === "" || password === ""}>
            {busy ? "Checking..." : "Authorize refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
