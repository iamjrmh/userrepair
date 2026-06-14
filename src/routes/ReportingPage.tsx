import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAsync } from "@/hooks/useAsync";
import { statusCounts } from "@/lib/repos/tickets";
import { componentFailureStats } from "@/lib/repos/intelligence";
import { inventoryValueCents, lowStockItems } from "@/lib/repos/inventory";
import { formatCents } from "@/lib/format";

function downloadCsv(filename: string, rows: Record<string, string | number>[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0] as Record<string, string | number>);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportingPage() {
  const { data } = useAsync(async () => {
    const [statuses, failures, invValue, low] = await Promise.all([
      statusCounts(),
      componentFailureStats(),
      inventoryValueCents(),
      lowStockItems(),
    ]);
    return { statuses, failures, invValue, low };
  }, []);

  if (!data) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporting"
        description="Operational metrics with CSV export."
        actions={
          <Button variant="outline" onClick={() => downloadCsv("tickets-by-status.csv", data.statuses)}>
            <Download /> Export status CSV
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Inventory value</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold tabular-nums">{formatCents(data.invValue)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Low-stock items</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold tabular-nums">{data.low.length}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Tracked faults</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold tabular-nums">{data.failures.reduce((s, f) => s + f.n, 0)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Most-failed components</CardTitle></CardHeader>
        <CardContent className="h-72">
          {data.failures.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No fault data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.failures} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="component_ref" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} allowDecimals={false} />
                <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="n" fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
