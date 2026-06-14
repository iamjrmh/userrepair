import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { callCommand } from "@/lib/net";
import {
  CreditCard,
  Banknote,
  Smartphone,
  Gift,
  Plus,
  Trash2,
  Receipt,
  ExternalLink,
  Printer,
  Settings,
  Ticket,
  Search,
  Lock,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { SaleDetailDialog } from "@/components/pos/SaleDetailDialog";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { listItems, findItemBySku } from "@/lib/repos/inventory";
import { listCustomers } from "@/lib/repos/customers";
import { getSetting } from "@/lib/repos/settings";
import {
  createSale,
  computeTotals,
  listSales,
  searchOpenTickets,
  getTicketCart,
  type PosCartItem,
  type PosTender,
  type OpenTicketHit,
} from "@/lib/repos/pos";
import { markTicketCompleted } from "@/lib/repos/tickets";
import { getRewardsConfig, customerPoints, pointsForValue, pointsValueCents } from "@/lib/repos/rewards";
import {
  getSquareSettings,
  createCardForm,
  tokenizeCard,
  type SquareSettings,
  type SquareCard,
  type SquareCardStyle,
} from "@/lib/square";
import { formatCents, dollarsToCents, centsToDollars, formatRelative } from "@/lib/format";
import type { SquarePaymentResult, SquareTerminalResult, PosSale } from "@/types";
import { printReceipt, type ReceiptPayload } from "@/lib/receipt";
import { useThemeStore } from "@/stores/theme";
import { useSyncStore } from "@/lib/sync";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function POSPage() {
  const { data: items } = useAsync(listItems, []);
  const { data: customers, reload: reloadCustomers } = useAsync(listCustomers, []);
  const { data: config } = useAsync(async () => {
    const sq = await getSquareSettings();
    const taxBp = await getSetting<number>("finance.tax_rate_bp", 0);
    const laborRate = await getSetting<number>("finance.labor_rate_cents", 6000);
    const rewards = await getRewardsConfig();
    return { sq, taxBp, laborRate, rewards };
  }, []);
  const { data: recent, reload: reloadRecent } = useAsync(() => listSales(8), []);

  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>("none");
  const [discount, setDiscount] = useState("0.00");
  const [tenders, setTenders] = useState<PosTender[]>([]);
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null);
  const [ringTicketId, setRingTicketId] = useState<number | null>(null);
  const [ringNumber, setRingNumber] = useState<string | null>(null);
  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketResults, setTicketResults] = useState<OpenTicketHit[]>([]);
  const [detailSale, setDetailSale] = useState<PosSale | null>(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  const { data: customerBalance } = useAsync(
    () => (customerId === "none" ? Promise.resolve(0) : customerPoints(Number(customerId))),
    [customerId],
  );

  const taxBp = config?.taxBp ?? 0;
  const laborRate = config?.laborRate ?? 6000;
  const totals = computeTotals(cart, dollarsToCents(discount), taxBp);
  const paid = tenders.reduce((s, t) => s + t.amount_cents, 0);
  const remaining = totals.total_cents - paid;
  const squareReady = (config?.sq.enabled ?? false) && !!config?.sq.applicationId && !!config?.sq.locationId;

  const rewardsEnabled = config?.rewards.enabled ?? false;
  const redeemCentsPerPoint = config?.rewards.redeemCentsPerPoint ?? 1;
  const customerSelected = customerId !== "none";
  const pointsRedeemed = tenders.filter((t) => t.method === "rewards").reduce((s, t) => s + (t.points ?? 0), 0);
  const availablePoints = Math.max(0, (customerBalance ?? 0) - pointsRedeemed);

  useEffect(() => {
    if (ticketQuery.trim() === "") {
      setTicketResults([]);
      return;
    }
    let active = true;
    const h = setTimeout(() => {
      searchOpenTickets(ticketQuery).then((r) => active && setTicketResults(r)).catch(() => active && setTicketResults([]));
    }, 150);
    return () => {
      active = false;
      clearTimeout(h);
    };
  }, [ticketQuery]);

  function addItem(item: PosCartItem) {
    setCart((c) => [...c, item]);
    setTenders([]); // changing the cart resets tenders
  }

  const handleScan = useCallback(async (code: string) => {
    const item = await findItemBySku(code.trim());
    if (!item) {
      toast.error(`No item with code ${code}`);
      return;
    }
    setCart((c) => [
      ...c,
      { kind: "item", description: item.description, quantity: 1, unit_price_cents: item.sale_price_cents || item.unit_cost_cents, item_id: item.id },
    ]);
    setTenders([]);
    toast.success(`Added ${item.description}`);
  }, []);

  useBarcodeScanner((code) => void handleScan(code));

  function setQty(idx: number, qty: number) {
    setCart((c) => c.map((it, i) => (i === idx ? { ...it, quantity: Number.isFinite(qty) && qty > 0 ? qty : it.quantity } : it)));
    setTenders([]);
  }
  function removeLine(idx: number) {
    setCart((c) => c.filter((_, i) => i !== idx));
    setTenders([]);
  }
  function resetSale() {
    setCart([]);
    setDiscount("0.00");
    setCustomerId("none");
    setTenders([]);
    setRingTicketId(null);
    setRingNumber(null);
  }

  async function loadTicket(hit: OpenTicketHit) {
    const { customerId: cid, items: ticketItems } = await getTicketCart(hit.id);
    setCart(ticketItems);
    setCustomerId(cid === null ? "none" : String(cid));
    setRingTicketId(hit.id);
    setRingNumber(hit.ticket_number);
    setTenders([]);
    setTicketQuery("");
    setTicketResults([]);
  }

  function addCashTender(tenderedCents: number) {
    const applied = Math.min(tenderedCents, remaining);
    const change = Math.max(0, tenderedCents - remaining);
    setTenders((t) => [...t, { method: "cash", amount_cents: applied, tendered_cents: tenderedCents, change_cents: change }]);
  }

  function addRewardsTender(points: number, valueCents: number) {
    setTenders((t) => [...t, { method: "rewards", amount_cents: valueCents, points }]);
  }

  async function addCardTender(token: string, amountCents: number) {
    setProcessing(true);
    try {
      const res = await callCommand<SquarePaymentResult>("square_create_payment", {
        sourceId: token,
        amountCents,
        referenceId: null,
        note: "userrepair POS",
      });
      if (res.status !== "COMPLETED" && res.status !== "APPROVED") throw new Error(`Payment ${res.status}`);
      setTenders((t) => [
        ...t,
        { method: "card", amount_cents: amountCents, square_payment_id: res.id, card_brand: res.card_brand, last4: res.last4, receipt_url: res.receipt_url },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Card payment failed");
    } finally {
      setProcessing(false);
    }
  }

  async function addTerminalTender(amountCents: number) {
    setProcessing(true);
    try {
      const start = await callCommand<SquareTerminalResult>("square_terminal_checkout", { amountCents, referenceId: null, note: "userrepair POS" });
      let status = start.status;
      let paymentId = start.payment_id;
      for (let i = 0; i < 90 && (status === "PENDING" || status === "IN_PROGRESS"); i += 1) {
        await sleep(2000);
        const s = await callCommand<SquareTerminalResult>("square_terminal_status", { checkoutId: start.checkout_id });
        status = s.status;
        paymentId = s.payment_id;
      }
      if (status !== "COMPLETED") throw new Error(`Terminal checkout ${status}`);
      setTenders((t) => [...t, { method: "terminal", amount_cents: amountCents, square_payment_id: paymentId }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Terminal checkout failed");
    } finally {
      setProcessing(false);
    }
  }

  async function finish() {
    setProcessing(true);
    try {
      const linkedTicket = ringTicketId;
      const sale = await createSale({
        ticket_id: linkedTicket,
        customer_id: customerId === "none" ? null : Number(customerId),
        items: cart,
        discount_cents: dollarsToCents(discount),
        tax_rate_bp: taxBp,
        tenders,
        note: linkedTicket ? `Ticket #${linkedTicket}` : null,
      });
      if (linkedTicket) await markTicketCompleted(linkedTicket);
      setReceipt({
        number: sale.number,
        dateIso: new Date().toISOString(),
        lines: cart.map((c) => ({
          description: c.description,
          quantity: c.quantity,
          unit_price_cents: c.unit_price_cents,
        })),
        subtotalCents: totals.subtotal_cents,
        discountCents: dollarsToCents(discount),
        taxCents: totals.tax_cents,
        totalCents: totals.total_cents,
        tenders,
        earnedPoints: sale.earnedPoints,
      });
      resetSale();
      reloadRecent();
      toast.success(`Sale ${sale.number} complete`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the sale");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Point of Sale"
        description="Sell parts, devices, and labor. Cash, card, Square Terminal, or any split."
        actions={
          <Button asChild variant="outline">
            <Link to="/settings"><Settings /> Payment settings</Link>
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
        <div className="flex min-h-0 flex-col gap-3">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Ticket className="h-4 w-4" /> Ring out a ticket</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {ringTicketId ? (
                <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 p-2 text-sm">
                  <span>Ringing out <span className="font-mono">{ringNumber}</span> - parts &amp; labor loaded</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => { setRingTicketId(null); setRingNumber(null); }}>
                    <X />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={ticketQuery} onChange={(e) => setTicketQuery(e.target.value)} placeholder="Customer phone, name, or ticket #..." className="pl-8" />
                  </div>
                  {ticketResults.length > 0 && (
                    <div className="divide-y divide-border rounded-md border border-border">
                      {ticketResults.map((t) => (
                        <button key={t.id} type="button" onClick={() => loadTicket(t)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary/40 cursor-pointer">
                          <span><span className="font-mono text-xs">{t.ticket_number}</span> {t.customer_name ?? "Walk-in"}</span>
                          <span className="text-xs text-muted-foreground">{t.phone ?? ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Add to cart</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Combobox
                options={(items ?? []).map((i) => ({ value: String(i.id), label: i.description, hint: `${formatCents(i.sale_price_cents || i.unit_cost_cents)} - qty ${i.quantity}` }))}
                value={null}
                onChange={(v) => {
                  const it = (items ?? []).find((i) => String(i.id) === v);
                  if (it) addItem({ kind: "item", description: it.description, quantity: 1, unit_price_cents: it.sale_price_cents || it.unit_cost_cents, item_id: it.id });
                }}
                placeholder="Search inventory to add..."
                searchPlaceholder="Search parts / devices..."
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => addItem({ kind: "labor", description: "Labor", quantity: 1, unit_price_cents: laborRate, item_id: null })}>
                  <Plus /> Labor ({formatCents(laborRate)}/hr)
                </Button>
                <Button variant="outline" size="sm" onClick={() => addItem({ kind: "custom", description: "Custom item", quantity: 1, unit_price_cents: 0, item_id: null })}>
                  <Plus /> Custom item
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1">
            <CardHeader><CardTitle>Cart ({cart.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 overflow-y-auto">
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cart is empty. Add inventory, labor, or a custom item.</p>
              ) : (
                cart.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex-1">
                      <Input
                        value={line.description}
                        onChange={(e) => setCart((c) => c.map((it, i) => (i === idx ? { ...it, description: e.target.value } : it)))}
                        className="h-8 border-0 bg-transparent px-0 font-medium shadow-none focus-visible:ring-0"
                      />
                      {line.item_id && <Badge variant="secondary">stock</Badge>}
                    </div>
                    <Input type="number" step={line.kind === "labor" ? "0.1" : "1"} value={String(line.quantity)} onChange={(e) => setQty(idx, parseFloat(e.target.value))} className="h-8 w-16" title={line.kind === "labor" ? "Hours" : "Quantity"} />
                    <Input value={centsToDollars(line.unit_price_cents)} onChange={(e) => setCart((c) => c.map((it, i) => (i === idx ? { ...it, unit_price_cents: dollarsToCents(e.target.value) } : it)))} className="h-8 w-24" />
                    <span className="w-24 text-right text-sm tabular-nums">{formatCents(Math.round(line.quantity * line.unit_price_cents))}</span>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeLine(idx)}>
                      <Trash2 />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {recent && recent.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent sales</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {recent.map((s) => (
                  <button key={s.id} type="button" onClick={() => setDetailSale(s)} className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-sm hover:bg-secondary/40 cursor-pointer">
                    <span className="font-mono text-xs">{s.sale_number}</span>
                    <span className="flex items-center gap-2">
                      {s.payment_status === "refunded" && <Badge variant="destructive">refunded</Badge>}
                      <Badge variant="secondary">{s.payment_method}</Badge>
                      <span className="tabular-nums">{formatCents(s.total_cents)}</span>
                      <span className="text-xs text-muted-foreground">{formatRelative(s.created_at)}</span>
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Checkout */}
        <Card className="flex flex-col">
          <CardHeader><CardTitle>Checkout</CardTitle></CardHeader>
          <CardContent className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Customer (optional)</Label>
                <button type="button" onClick={() => setNewCustomerOpen(true)} className="text-xs text-primary hover:underline cursor-pointer">
                  + New customer
                </button>
              </div>
              <Combobox
                options={[{ value: "none", label: "Walk-in" }, ...(customers ?? []).map((c) => ({ value: String(c.id), label: c.name, hint: c.phone ?? undefined }))]}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Walk-in"
                searchPlaceholder="Search customers..."
              />
              {rewardsEnabled && customerSelected && (
                <p className="text-xs text-muted-foreground">
                  Rewards balance: <span className="font-medium text-foreground">{customerBalance ?? 0}</span> points
                </p>
              )}
            </div>

            <div className="space-y-1 rounded-md border border-border p-3 text-sm">
              <Row label="Subtotal" value={formatCents(totals.subtotal_cents)} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <Input value={discount} onChange={(e) => { setDiscount(e.target.value); setTenders([]); }} className="h-7 w-24 text-right" />
              </div>
              <Row label={`Tax (${(taxBp / 100).toFixed(2)}%)`} value={formatCents(totals.tax_cents)} />
              <div className="flex items-center justify-between border-t border-border pt-1 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCents(totals.total_cents)}</span>
              </div>
            </div>

            {receipt ? (
              <ReceiptPanel receipt={receipt} onDone={() => setReceipt(null)} />
            ) : (
              <div className="space-y-3">
                {tenders.length > 0 && (
                  <div className="space-y-1 rounded-md border border-border p-2 text-sm">
                    {tenders.map((t, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Badge variant="secondary">{t.method}</Badge>
                          {t.last4 ? `****${t.last4}` : ""}
                          {t.change_cents ? <span className="text-xs text-muted-foreground">change {formatCents(t.change_cents)}</span> : null}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{formatCents(t.amount_cents)}</span>
                          {t.method === "cash" && (
                            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => setTenders((arr) => arr.filter((_, j) => j !== i))}>
                              <Trash2 />
                            </Button>
                          )}
                        </span>
                      </div>
                    ))}
                    <div className={`flex justify-between border-t border-border pt-1 font-semibold ${remaining <= 0 ? "text-success" : ""}`}>
                      <span>{remaining > 0 ? "Remaining" : "Paid in full"}</span>
                      <span className="tabular-nums">{formatCents(Math.max(0, remaining))}</span>
                    </div>
                  </div>
                )}

                {remaining > 0 ? (
                  <PaymentAdder
                    remaining={remaining}
                    settings={config?.sq ?? null}
                    squareReady={squareReady}
                    hasTerminal={!!config?.sq.deviceId}
                    processing={processing}
                    showRewards={rewardsEnabled && customerSelected && availablePoints > 0}
                    availablePoints={availablePoints}
                    redeemCentsPerPoint={redeemCentsPerPoint}
                    onCash={addCashTender}
                    onCard={addCardTender}
                    onTerminal={addTerminalTender}
                    onRewards={addRewardsTender}
                  />
                ) : (
                  <Button className="w-full" disabled={processing || cart.length === 0} onClick={finish}>
                    Finish &amp; record sale
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {detailSale && (
        <SaleDetailDialog sale={detailSale} onClose={() => setDetailSale(null)} onChanged={reloadRecent} />
      )}
      <CustomerFormDialog
        open={newCustomerOpen}
        onOpenChange={setNewCustomerOpen}
        onSaved={(id) => {
          reloadCustomers();
          setCustomerId(String(id));
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
      Square is not configured or disabled. Add your credentials in{" "}
      <Link to="/settings" className="text-primary underline">Settings &gt; Payments</Link>.
    </div>
  );
}

function PaymentAdder({
  remaining,
  settings,
  squareReady,
  hasTerminal,
  processing,
  showRewards,
  availablePoints,
  redeemCentsPerPoint,
  onCash,
  onCard,
  onTerminal,
  onRewards,
}: {
  remaining: number;
  settings: SquareSettings | null;
  squareReady: boolean;
  hasTerminal: boolean;
  processing: boolean;
  showRewards: boolean;
  availablePoints: number;
  redeemCentsPerPoint: number;
  onCash: (tenderedCents: number) => void;
  onCard: (token: string, amountCents: number) => void | Promise<void>;
  onTerminal: (amountCents: number) => void | Promise<void>;
  onRewards: (points: number, valueCents: number) => void;
}) {
  const [cardAmt, setCardAmt] = useState(centsToDollars(remaining));
  const [termAmt, setTermAmt] = useState(centsToDollars(remaining));

  useEffect(() => {
    setCardAmt(centsToDollars(remaining));
    setTermAmt(centsToDollars(remaining));
  }, [remaining]);

  const cardCents = Math.min(dollarsToCents(cardAmt), remaining);
  const termCents = Math.min(dollarsToCents(termAmt), remaining);

  return (
    <Tabs defaultValue="cash">
      <TabsList className={`grid w-full ${showRewards ? "grid-cols-4" : "grid-cols-3"}`}>
        <TabsTrigger value="cash"><Banknote className="mr-1 h-4 w-4" /> Cash</TabsTrigger>
        <TabsTrigger value="card"><CreditCard className="mr-1 h-4 w-4" /> Card</TabsTrigger>
        <TabsTrigger value="terminal"><Smartphone className="mr-1 h-4 w-4" /> Terminal</TabsTrigger>
        {showRewards && <TabsTrigger value="rewards"><Gift className="mr-1 h-4 w-4" /> Points</TabsTrigger>}
      </TabsList>

      <TabsContent value="cash">
        <CashAdder remaining={remaining} disabled={processing} onAdd={onCash} />
      </TabsContent>

      {showRewards && (
        <TabsContent value="rewards">
          <RewardsAdder available={availablePoints} redeemCentsPerPoint={redeemCentsPerPoint} remaining={remaining} onAdd={onRewards} />
        </TabsContent>
      )}

      <TabsContent value="card">
        {squareReady && settings ? (
          <div className="space-y-2">
            <Label>Amount on this card</Label>
            <Input value={cardAmt} onChange={(e) => setCardAmt(e.target.value)} />
            <CardCheckout settings={settings} amount={cardCents} disabled={processing || cardCents <= 0} onCharge={(token) => onCard(token, cardCents)} />
          </div>
        ) : (
          <NotConfigured />
        )}
      </TabsContent>

      <TabsContent value="terminal">
        {squareReady && hasTerminal ? (
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input value={termAmt} onChange={(e) => setTermAmt(e.target.value)} />
            <Button className="w-full" disabled={processing || termCents <= 0} onClick={() => onTerminal(termCents)}>
              Send {formatCents(termCents)} to Terminal
            </Button>
          </div>
        ) : squareReady ? (
          <p className="text-sm text-muted-foreground">Add a Square Terminal device id in Settings &gt; Payments to use a reader.</p>
        ) : (
          <NotConfigured />
        )}
      </TabsContent>
    </Tabs>
  );
}

function CashAdder({
  remaining,
  disabled,
  onAdd,
}: {
  remaining: number;
  disabled: boolean;
  onAdd: (tenderedCents: number) => void;
}) {
  const [tendered, setTendered] = useState("");
  const cents = dollarsToCents(tendered);
  const hasInput = tendered.trim() !== "";
  const change = Math.max(0, cents - remaining);

  return (
    <div className="space-y-2">
      <Label>Cash tendered</Label>
      <Input
        value={tendered}
        onChange={(e) => setTendered(e.target.value)}
        placeholder="0.00"
        inputMode="decimal"
        autoFocus
        className="text-right text-lg font-semibold tabular-nums"
      />
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={() => setTendered(centsToDollars(remaining))}>Exact</Button>
        {[2000, 5000, 10000].map((amt) => (
          <Button key={amt} variant="outline" size="sm" onClick={() => setTendered(centsToDollars(amt))}>{formatCents(amt)}</Button>
        ))}
      </div>
      {hasInput && (
        <div className="rounded-md border border-border p-2 text-center text-sm">
          {cents >= remaining ? (
            <span>Change due <span className="font-semibold tabular-nums text-success">{formatCents(change)}</span></span>
          ) : (
            <span className="text-muted-foreground">Applies {formatCents(cents)} - {formatCents(remaining - cents)} will remain</span>
          )}
        </div>
      )}
      <Button className="w-full" disabled={disabled || cents <= 0} onClick={() => { onAdd(cents); setTendered(""); }}>
        Add cash payment
      </Button>
    </div>
  );
}

function RewardsAdder({
  available,
  redeemCentsPerPoint,
  remaining,
  onAdd,
}: {
  available: number;
  redeemCentsPerPoint: number;
  remaining: number;
  onAdd: (points: number, valueCents: number) => void;
}) {
  const [points, setPoints] = useState("");
  const maxPoints = Math.min(available, pointsForValue(remaining, redeemCentsPerPoint));
  const entered = Math.floor(Number(points) || 0);
  const pts = Math.min(Math.max(0, entered), maxPoints);
  const value = Math.min(pointsValueCents(pts, redeemCentsPerPoint), remaining);

  return (
    <div className="space-y-2">
      <Label>Points to redeem (balance {available})</Label>
      <div className="flex gap-2">
        <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="0" />
        <Button variant="outline" onClick={() => setPoints(String(maxPoints))}>Max</Button>
      </div>
      <div className="rounded-md border border-border p-2 text-center text-sm">
        {pts} points = <span className="font-semibold text-success">{formatCents(value)}</span> off
      </div>
      <Button className="w-full" disabled={pts <= 0} onClick={() => { onAdd(pts, value); setPoints(""); }}>
        Redeem {pts} points
      </Button>
    </div>
  );
}

function CardCheckout({
  settings,
  amount,
  disabled,
  onCharge,
}: {
  settings: SquareSettings;
  amount: number;
  disabled: boolean;
  onCharge: (token: string) => void | Promise<void>;
}) {
  const cardRef = useRef<SquareCard | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenizing, setTokenizing] = useState(false);
  const themeMode = useThemeStore((s) => s.mode);
  const internet = useSyncStore((s) => s.internet);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError(null);
    createCardForm(settings, "#sq-card-container", squareCardStyle())
      .then((card) => {
        if (active) {
          cardRef.current = card;
          setReady(true);
        } else {
          void card.destroy();
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Failed to load card form");
      });
    return () => {
      active = false;
      const card = cardRef.current;
      cardRef.current = null;
      if (card) void card.destroy();
    };
    // Rebuild the field when the theme changes so the colors stay in sync.
  }, [settings, themeMode]);

  async function pay() {
    if (!cardRef.current) return;
    setTokenizing(true);
    setError(null);
    try {
      const token = await tokenizeCard(cardRef.current);
      await onCharge(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Card error");
    } finally {
      setTokenizing(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <CreditCard className="h-4 w-4 text-primary" /> Card details
          </span>
          <span className="text-sm font-semibold tabular-nums">{formatCents(amount)}</span>
        </div>
        <div
          id="sq-card-container"
          className="min-h-[44px] transition-opacity duration-200"
          style={{ opacity: ready ? 1 : 0.45 }}
        />
        {!ready && !error && (
          <p className="mt-2 text-xs text-muted-foreground">Loading secure card field...</p>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        {!internet && (
          <p className="mt-2 text-xs text-warning">
            No internet connection. Card payments need internet - take cash or retry once youre back online.
          </p>
        )}
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" /> Encrypted and processed by Square. Card numbers never touch this app.
        </p>
      </div>
      <Button className="w-full" size="lg" disabled={disabled || !ready || tokenizing || !internet} onClick={pay}>
        {tokenizing ? (
          "Processing..."
        ) : (
          <>
            <Lock className="h-4 w-4" /> Charge {formatCents(amount)}
          </>
        )}
      </Button>
    </div>
  );
}

/**
 * Build a Square Card style object from the app's live theme variables so the
 * hosted card field blends into the surrounding UI in both light and dark mode.
 */
function squareCardStyle(): SquareCardStyle {
  const root = getComputedStyle(document.documentElement);
  // Square's card style only accepts hex colors, not the space-separated
  // hsl() syntax our theme variables use. A canvas context normalizes any
  // valid CSS color back to a #rrggbb string, so use it as the converter.
  const ctx = document.createElement("canvas").getContext("2d");
  const toHex = (cssColor: string): string => {
    if (!ctx) return cssColor;
    ctx.fillStyle = "#000000";
    ctx.fillStyle = cssColor;
    return ctx.fillStyle as string;
  };
  const v = (name: string) => toHex(`hsl(${root.getPropertyValue(name).trim()})`);
  return {
    input: {
      color: v("--foreground"),
      backgroundColor: v("--card"),
      fontSize: "15px",
    },
    "input::placeholder": { color: v("--muted-foreground") },
    ".input-container": {
      borderColor: v("--input"),
      borderRadius: "8px",
    },
    ".input-container.is-focus": { borderColor: v("--ring") },
    ".input-container.is-error": { borderColor: v("--destructive") },
    ".message-text": { color: v("--muted-foreground") },
    ".message-icon": { color: v("--muted-foreground") },
    ".message-text.is-error": { color: v("--destructive") },
    ".message-icon.is-error": { color: v("--destructive") },
  };
}

function ReceiptPanel({ receipt, onDone }: { receipt: ReceiptPayload; onDone: () => void }) {
  const totalChange = receipt.tenders.reduce((s, t) => s + (t.change_cents ?? 0), 0);
  const cardReceipt = receipt.tenders.find((t) => t.receipt_url)?.receipt_url;
  return (
    <div className="space-y-3 rounded-md border border-success/40 bg-success/10 p-4 text-center">
      <Receipt className="mx-auto h-8 w-8 text-success" />
      <div>
        <div className="font-semibold">{receipt.number} paid</div>
        <div className="text-2xl font-bold tabular-nums">{formatCents(receipt.totalCents)}</div>
      </div>
      <div className="space-y-0.5 text-sm">
        {receipt.tenders.map((t, i) => (
          <div key={i} className="flex justify-between">
            <span className="capitalize text-muted-foreground">{t.method}{t.last4 ? ` ****${t.last4}` : ""}</span>
            <span className="tabular-nums">{formatCents(t.amount_cents)}</span>
          </div>
        ))}
        {totalChange > 0 && (
          <div className="flex justify-between font-medium">
            <span>Change given</span>
            <span className="tabular-nums">{formatCents(totalChange)}</span>
          </div>
        )}
      </div>
      {receipt.earnedPoints > 0 && (
        <div className="flex items-center justify-center gap-1 text-sm font-medium text-primary">
          <Gift className="h-4 w-4" /> Earned {receipt.earnedPoints} points
        </div>
      )}
      <Button variant="outline" size="sm" className="w-full" onClick={() => void printReceipt(receipt)}>
        <Printer /> Print receipt
      </Button>
      {cardReceipt && (
        <Button variant="outline" size="sm" onClick={() => void invoke("open_external", { path: cardReceipt })}>
          <ExternalLink /> View Square receipt
        </Button>
      )}
      <Button className="w-full" onClick={onDone}>New sale</Button>
    </div>
  );
}
